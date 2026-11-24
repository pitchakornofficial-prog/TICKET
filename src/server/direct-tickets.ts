import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { inTransaction } from './database.ts';
import { ensureEventSchema } from './events.ts';
import { ensureReservationSchema } from './reservation.ts';
import {
  buildTicketsToIssue,
  ensureTicketSchema,
  generateTicketQrSvg,
  type TicketDetail,
  type TicketIssuanceItemRow,
} from './tickets.ts';
import { sendDirectIssuedTicketsEmail } from './ticket-delivery.ts';

export interface IssueDirectTicketsInput {
  eventId: string;
  sessionId: string;
  items: { ticketTypeId: string; quantity: number }[];
  recipientMode: 'organizer' | 'owner' | 'custom';
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  referenceNote?: string;
  priceDisplayMode?: 'face_value' | 'complimentary';
  sendEmail?: boolean;
  issuedByUserId: string;
  now?: Date;
}

export interface DirectTicketBatchSummary {
  orderId: string;
  eventId: string;
  eventTitle: string;
  sessionId: string;
  sessionStartTime: string;
  sessionEndTime: string;
  location: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  issuedByUserId: string | null;
  issuedByName: string | null;
  issuedForUserId: string | null;
  referenceNote: string | null;
  priceDisplayMode: 'face_value' | 'complimentary';
  totalTickets: number;
  validTickets: number;
  admittedTickets: number;
  cancelledTickets: number;
  createdAt: string;
  revokedAt?: string | null;
  items: {
    ticketTypeId: string;
    ticketTypeName: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export interface DirectIssuanceEventOption {
  eventId: string;
  eventTitle: string;
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  salesStartTime?: string | null;
  salesEndTime?: string | null;
  isSalesEnded?: boolean;
  sessions: {
    sessionId: string;
    startTime: string;
    endTime: string;
    status: string;
    isSessionEnded?: boolean;
    isSalesEnded?: boolean;
    salesStatusLabel?: string;
    ticketTypes: {
      ticketTypeId: string;
      name: string;
      price: number;
      quota: number;
      totalQuota: number;
      webSold: number;
      directIssued: number;
      returnedQuota?: number;
      available: number;
      remainingQuota: number;
    }[];
  }[];
}

export async function issueDirectTickets(
  pool: Pool,
  input: IssueDirectTicketsInput,
): Promise<{
  orderId: string;
  tickets: TicketDetail[];
  totalTickets: number;
  emailSent: boolean;
  emailError?: string;
}> {
  await ensureEventSchema(pool);
  await ensureTicketSchema(pool);
  await ensureReservationSchema(pool);

  const now = input.now || new Date();

  // Validate items
  if (!input.items || input.items.length === 0) {
    throw new Error('กรุณาระบุประเภทบัตรและจำนวนที่ต้องการดึง');
  }

  const sanitizedItems = input.items
    .map(it => ({ ticketTypeId: it.ticketTypeId?.trim(), quantity: Number(it.quantity) }))
    .filter(it => it.ticketTypeId && it.quantity > 0);

  if (sanitizedItems.length === 0) {
    throw new Error('กรุณาระบุจำนวนบัตรที่ถูกต้อง (มากกว่า 0 ใบ)');
  }

  const totalRequested = sanitizedItems.reduce((acc, it) => acc + it.quantity, 0);
  if (totalRequested > 500) {
    throw new Error('เพื่อความเสถียรของระบบ สามารถออกบัตรได้ครั้งละไม่เกิน 500 ใบต่อหนึ่งรายการ');
  }

  // Lookup Event & Session
  const evRes = await pool.query<{
    id: string;
    title: string;
    location: string;
    posterUrl: string | null;
    ticketTemplateUrl: string | null;
    organizerId: string;
    organizerName: string;
    organizerEmail: string;
  }>(
    `SELECT e.id, e.title, e.location, e."posterUrl", e."ticketTemplateUrl",
            e."organizerId", u.name AS "organizerName", u.email AS "organizerEmail"
     FROM events e
     JOIN auth_user u ON u.id = e."organizerId"
     WHERE e.id = $1`,
    [input.eventId],
  );

  if (evRes.rowCount === 0) {
    throw new Error('ไม่พบข้อมูลคอนเสิร์ต');
  }
  const event = evRes.rows[0];

  const sessRes = await pool.query<{
    id: string;
    status: string;
    startTime: Date;
    endTime: Date;
  }>(
    `SELECT id, status, "startTime", "endTime"
     FROM event_sessions
     WHERE id = $1 AND "eventId" = $2`,
    [input.sessionId, input.eventId],
  );

  if (sessRes.rowCount === 0) {
    throw new Error('ไม่พบข้อมูลรอบการแสดง');
  }
  const session = sessRes.rows[0];

  if (session.status !== 'approved') {
    throw new Error('สามารถออกบัตรตรงได้เฉพาะรอบการแสดงที่ได้รับการอนุมัติแล้วเท่านั้น');
  }

  if (session.endTime && now.getTime() >= new Date(session.endTime).getTime()) {
    throw new Error('ไม่สามารถออกบัตรตรงสำหรับรอบการแสดงที่สิ้นสุดไปแล้วได้');
  }

  // Lookup Issuer User
  let issuerName = 'ผู้ดูแลระบบ';
  const issuerRes = await pool.query<{ name: string; email: string }>(
    `SELECT name, email FROM auth_user WHERE id = $1`,
    [input.issuedByUserId],
  );
  if (issuerRes.rowCount && issuerRes.rows[0]?.name) {
    issuerName = issuerRes.rows[0].name;
  }

  // Determine Recipient
  let buyerName = '';
  let buyerEmail = '';
  let buyerPhone = '0000000000';
  let issuedForUserId: string | null = null;

  if (input.recipientMode === 'organizer') {
    buyerName = event.organizerName || 'ผู้จัดงาน';
    buyerEmail = event.organizerEmail;
    issuedForUserId = event.organizerId;
  } else if (input.recipientMode === 'owner') {
    buyerName = issuerName;
    buyerEmail = issuerRes.rows[0]?.email || 'owner@ticket.local';
    issuedForUserId = input.issuedByUserId;
  } else {
    // Custom
    buyerName = (input.recipientName || '').trim() || 'ผู้จัดงาน';
    buyerEmail = (input.recipientEmail || '').trim().toLowerCase();
    buyerPhone = (input.recipientPhone || '').trim() || '0000000000';
    if (!buyerEmail?.includes('@')) {
      throw new Error('กรุณาระบุอีเมลผู้รับบัตรที่ถูกต้อง');
    }
  }

  const priceDisplayMode = input.priceDisplayMode === 'complimentary' ? 'complimentary' : 'face_value';
  const referenceNote = (input.referenceNote || '').trim() || null;

  // Run in database transaction
  const result = await inTransaction(pool, async (client) => {
    // Lock ticket types in deterministic sorted order
    const distinctTtIds = Array.from(new Set(sanitizedItems.map(it => it.ticketTypeId))).sort();
    const ttRes = await client.query<{
      id: string;
      name: string;
      price: string | number;
      quota: number;
    }>(
      `SELECT id, name, price, quota
       FROM ticket_types
       WHERE id = ANY($1::text[]) AND "sessionId" = $2
       ORDER BY id
       FOR NO KEY UPDATE`,
      [distinctTtIds, input.sessionId],
    );

    if (ttRes.rowCount !== distinctTtIds.length) {
      throw new Error('มีประเภทบัตรที่ระบุไม่ได้อยู่ในรอบการแสดงนี้');
    }

    const ttMap = new Map(ttRes.rows.map(r => [r.id, r]));

    // Check available quota for each requested item
    for (const item of sanitizedItems) {
      const tt = ttMap.get(item.ticketTypeId);
      if (!tt) throw new Error('ไม่พบข้อมูลประเภทบัตร');

      const quotaRes = await client.query<{ available: number }>(
        `WITH held_calc AS (
           SELECT GREATEST(0,
             COALESCE((
               SELECT SUM(b.qty)::int
               FROM ticket_type_paid_buckets b
               WHERE b."ticketTypeId" = $1
             ), (
               SELECT COALESCE(SUM(oi.quantity), 0)::int
               FROM order_items oi
               JOIN orders o ON oi."orderId" = o.id
               WHERE oi."ticketTypeId" = $1 AND o.status = 'paid'
             )) + COALESCE((
               SELECT SUM(oi.quantity)::int
               FROM orders o
               JOIN order_items oi ON oi."orderId" = o.id
               WHERE o.status = 'reserved'
                 AND o."expiresAt" > $2
                 AND oi."ticketTypeId" = $1
             ), 0) - COALESCE((
               SELECT COUNT(*)::int
               FROM tickets t
               WHERE t."ticketTypeId" = $1
                 AND t.status IN ('refunded', 'cancelled')
             ), 0)
           )::int AS held
         )
         SELECT ($3::int - held_calc.held)::int AS available
         FROM held_calc`,
        [tt.id, now, Number(tt.quota)],
      );

      const available = Number(quotaRes.rows[0]?.available) || 0;
      if (available < item.quantity) {
        throw new Error(
          `บัตรประเภท "${tt.name}" เหลือโควตาไม่เพียงพอ (ต้องการ ${item.quantity} ใบ แต่เหลือเพียง ${Math.max(0, available)} ใบ)`,
        );
      }
    }

    // Generate unique Order ID with DIR- prefix
    const entropy = randomBytes(4).toString('hex').toUpperCase();
    const orderId = `DIR-${entropy}`;

    // Insert Order
    await client.query(
      `INSERT INTO orders (
         id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
         status, subtotal, "discountAmount", "customerFee", total,
         "customerFeeMode", "customerFeeRate", "reservedAt", "expiresAt",
         "orderSource", "issuedByUserId", "issuedForUserId", "referenceNote", "priceDisplayMode"
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         'paid', 0, 0, 0, 0,
         'fixed_per_order', 0, $7, $7,
         'direct_issue', $8, $9, $10, $11
       )`,
      [
        orderId,
        input.eventId,
        input.sessionId,
        buyerEmail,
        buyerName,
        buyerPhone,
        now,
        input.issuedByUserId,
        issuedForUserId,
        referenceNote,
        priceDisplayMode,
      ],
    );

    // Insert Order Items and prepare ticket issuance
    const issuanceItems: TicketIssuanceItemRow[] = [];

    for (const item of sanitizedItems) {
      const tt = ttMap.get(item.ticketTypeId);
      if (!tt) continue;
      const orderItemId = `OIT-${randomUUID()}`;
      const unitPrice = Number(tt.price);

      await client.query(
        `INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
         VALUES ($1, $2, $3, $4, $5, 0)`,
        [orderItemId, orderId, tt.id, item.quantity, unitPrice],
      );

      issuanceItems.push({
        id: orderItemId,
        ticketTypeId: tt.id,
        quantity: item.quantity,
        unitPrice,
        eventId: input.eventId,
        sessionId: input.sessionId,
        buyerName,
        buyerEmail,
        buyerPhone,
        ticketTypeName: tt.name,
        sessionStartTime: session.startTime,
        sessionEndTime: session.endTime,
        location: event.location,
        eventTitle: event.title,
      });
    }

    // Build tickets
    const built = buildTicketsToIssue(orderId, issuanceItems, now);

    // Batch insert tickets
    for (const ticket of built.issuedTickets) {
      ticket.ticketTemplateUrl = event.ticketTemplateUrl;
      ticket.eventPosterUrl = event.posterUrl;

      await client.query(
        `INSERT INTO tickets (
           id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId",
           "ticketCode", "qrPayload", price, status, "admissionStatus", "createdAt", "updatedAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'valid', 'outside', $10, $10)`,
        [
          ticket.id,
          ticket.orderId,
          ticket.orderItemId,
          ticket.eventId,
          ticket.sessionId,
          ticket.ticketTypeId,
          ticket.ticketCode,
          ticket.qrPayload,
          ticket.ticketPrice,
          now,
        ],
      );
    }

    return {
      orderId,
      tickets: built.issuedTickets,
      totalTickets: built.issuedTickets.length,
    };
  });

  // Handle email delivery outside transaction
  let emailSent = false;
  let emailError: string | undefined;

  if (input.sendEmail !== false) {
    try {
      const emailRes = await sendDirectIssuedTicketsEmail(pool, result.orderId, {
        now,
      });
      emailSent = emailRes.success;
      if (!emailRes.success) {
        emailError = emailRes.error;
      }
    } catch (err: unknown) {
      emailError = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งอีเมล';
    }
  }

  return {
    orderId: result.orderId,
    tickets: result.tickets,
    totalTickets: result.totalTickets,
    emailSent,
    emailError,
  };
}

export async function listDirectTicketBatches(
  pool: Pool,
  filters: {
    eventId?: string;
    organizerId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ batches: DirectTicketBatchSummary[]; total: number }> {
  await ensureReservationSchema(pool);
  await ensureTicketSchema(pool);

  const conditions: string[] = ["o.\"orderSource\" = 'direct_issue'"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.eventId) {
    conditions.push(`o."eventId" = $${paramIdx++}`);
    params.push(filters.eventId);
  }

  if (filters.organizerId) {
    conditions.push(`(e."organizerId" = $${paramIdx} OR o."issuedForUserId" = $${paramIdx})`);
    params.push(filters.organizerId);
    paramIdx++;
  }

  if (filters.search?.trim()) {
    const s = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      `(LOWER(o.id) LIKE $${paramIdx} OR LOWER(o."buyerName") LIKE $${paramIdx} OR LOWER(o."buyerEmail") LIKE $${paramIdx} OR LOWER(COALESCE(o."referenceNote", '')) LIKE $${paramIdx} OR LOWER(e.title) LIKE $${paramIdx})`,
    );
    params.push(s);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM orders o
     JOIN events e ON e.id = o."eventId"
     ${whereClause}`,
    params,
  );
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  const limit = Math.min(Math.max(1, filters.limit || 20), 100);
  const offset = Math.max(0, filters.offset || 0);

  const rowsRes = await pool.query<{
    orderId: string;
    eventId: string;
    eventTitle: string;
    sessionId: string;
    sessionStartTime: Date;
    sessionEndTime: Date;
    location: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string;
    issuedByUserId: string | null;
    issuedByName: string | null;
    issuedForUserId: string | null;
    referenceNote: string | null;
    priceDisplayMode: string | null;
    createdAt: Date;
    revokedAt: string | null;
    totalTickets: string;
    validTickets: string;
    admittedTickets: string;
    cancelledTickets: string;
    itemsJson: {
      ticketTypeId: string;
      ticketTypeName: string;
      quantity: number;
      unitPrice: number;
    }[];
  }>(
    `SELECT o.id AS "orderId",
            o."eventId",
            e.title AS "eventTitle",
            o."sessionId",
            es."startTime" AS "sessionStartTime",
            es."endTime" AS "sessionEndTime",
            e.location,
            o."buyerName",
            o."buyerEmail",
            o."buyerPhone",
            o."issuedByUserId",
            u.name AS "issuedByName",
            o."issuedForUserId",
            o."referenceNote",
            o."priceDisplayMode",
            o."createdAt",
            MAX(t."updatedAt") FILTER (WHERE t.status = 'cancelled')::text AS "revokedAt",
            COUNT(DISTINCT t.id)::text AS "totalTickets",
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'valid' AND t."admissionStatus" = 'outside')::text AS "validTickets",
            COUNT(DISTINCT t.id) FILTER (WHERE t."admissionStatus" IN ('inside', 'admitted') OR t.status = 'used')::text AS "admittedTickets",
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'cancelled')::text AS "cancelledTickets",
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'ticketTypeId', oi."ticketTypeId",
                  'ticketTypeName', tt.name,
                  'quantity', oi.quantity,
                  'unitPrice', oi."unitPrice"
                )
              ) FILTER (WHERE oi.id IS NOT NULL),
              '[]'::json
            ) AS "itemsJson"
     FROM orders o
     JOIN events e ON e.id = o."eventId"
     JOIN event_sessions es ON es.id = o."sessionId"
     LEFT JOIN auth_user u ON u.id = o."issuedByUserId"
     LEFT JOIN order_items oi ON oi."orderId" = o.id
     LEFT JOIN ticket_types tt ON tt.id = oi."ticketTypeId"
     LEFT JOIN tickets t ON t."orderId" = o.id
     ${whereClause}
     GROUP BY o.id, e.id, es.id, u.id
     ORDER BY o."createdAt" DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  );

  const batches: DirectTicketBatchSummary[] = rowsRes.rows.map(r => ({
    orderId: r.orderId,
    eventId: r.eventId,
    eventTitle: r.eventTitle,
    sessionId: r.sessionId,
    sessionStartTime: new Date(r.sessionStartTime).toISOString(),
    sessionEndTime: new Date(r.sessionEndTime).toISOString(),
    location: r.location,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhone: r.buyerPhone,
    issuedByUserId: r.issuedByUserId,
    issuedByName: r.issuedByName,
    issuedForUserId: r.issuedForUserId,
    referenceNote: r.referenceNote,
    priceDisplayMode: r.priceDisplayMode === 'complimentary' ? 'complimentary' : 'face_value',
    totalTickets: parseInt(r.totalTickets || '0', 10),
    validTickets: parseInt(r.validTickets || '0', 10),
    admittedTickets: parseInt(r.admittedTickets || '0', 10),
    cancelledTickets: parseInt(r.cancelledTickets || '0', 10),
    createdAt: new Date(r.createdAt).toISOString(),
    revokedAt: r.revokedAt ? new Date(r.revokedAt).toISOString() : null,
    items: r.itemsJson || [],
  }));

  return { batches, total };
}

export async function getDirectTicketBatchDetail(
  pool: Pool,
  orderId: string,
  requesterOrganizerId?: string,
): Promise<{
  batch: DirectTicketBatchSummary;
  tickets: TicketDetail[];
}> {
  await ensureReservationSchema(pool);
  await ensureTicketSchema(pool);

  const batchesRes = await listDirectTicketBatches(pool, {
    search: orderId,
    limit: 1,
  });

  const batch = batchesRes.batches.find(b => b.orderId === orderId);
  if (!batch) {
    throw new Error('ไม่พบข้อมูลรายการออกบัตรตรงนี้');
  }

  // If requester is organizer, verify ownership
  if (requesterOrganizerId) {
    const checkRes = await pool.query<{ id: string }>(
      `SELECT e.id FROM events e
       JOIN orders o ON o."eventId" = e.id
       WHERE o.id = $1 AND (e."organizerId" = $2 OR o."issuedForUserId" = $2)`,
      [orderId, requesterOrganizerId],
    );
    if (checkRes.rowCount === 0) {
      throw new Error('ไม่มีสิทธิ์เข้าถึงรายการออกบัตรของงานอื่น');
    }
  }

  // Fetch full tickets
  const ticketsRes = await pool.query<{
    id: string;
    orderId: string;
    orderItemId: string;
    eventId: string;
    sessionId: string;
    ticketTypeId: string;
    ticketTypeName: string;
    ticketPrice: number | string;
    ticketCode: string;
    qrPayload: string;
    status: 'valid' | 'used' | 'refunded' | 'cancelled';
    admissionStatus: 'outside' | 'inside';
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string;
    sessionStartTime: Date;
    sessionEndTime: Date;
    location: string;
    eventTitle: string;
    ticketTemplateUrl: string | null;
    eventPosterUrl: string | null;
    createdAt: Date;
  }>(
    `SELECT t.id, t."orderId", t."orderItemId", t."eventId", t."sessionId", t."ticketTypeId",
            tt.name AS "ticketTypeName", COALESCE(t.price, tt.price) AS "ticketPrice",
            t."ticketCode", t."qrPayload", t.status, t."admissionStatus",
            o."buyerName", o."buyerEmail", o."buyerPhone",
            es."startTime" AS "sessionStartTime", es."endTime" AS "sessionEndTime",
            e.location, e.title AS "eventTitle",
            e."ticketTemplateUrl", e."posterUrl" AS "eventPosterUrl",
            t."createdAt"
     FROM tickets t
     JOIN orders o ON o.id = t."orderId"
     JOIN events e ON e.id = t."eventId"
     JOIN event_sessions es ON es.id = t."sessionId"
     JOIN ticket_types tt ON tt.id = t."ticketTypeId"
     WHERE t."orderId" = $1
     ORDER BY tt.price DESC, t."ticketCode" ASC`,
    [orderId],
  );

  const tickets: TicketDetail[] = ticketsRes.rows.map(r => ({
    id: r.id,
    orderId: r.orderId,
    orderItemId: r.orderItemId,
    eventId: r.eventId,
    sessionId: r.sessionId,
    ticketTypeId: r.ticketTypeId,
    ticketTypeName: r.ticketTypeName,
    ticketPrice: Number(r.ticketPrice),
    ticketCode: r.ticketCode,
    qrPayload: r.qrPayload,
    qrCodeUrl: generateTicketQrSvg(r.ticketCode, r.qrPayload),
    status: r.status,
    admissionStatus: r.admissionStatus,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhone: r.buyerPhone,
    sessionStartTime: new Date(r.sessionStartTime).toISOString(),
    sessionEndTime: new Date(r.sessionEndTime).toISOString(),
    location: r.location,
    eventTitle: r.eventTitle,
    ticketTemplateUrl: r.ticketTemplateUrl,
    eventPosterUrl: r.eventPosterUrl,
    createdAt: new Date(r.createdAt).toISOString(),
  }));

  return { batch, tickets };
}

export async function revokeDirectTickets(
  pool: Pool,
  input: {
    orderId: string;
    ticketIds?: string[];
    revokedByUserId: string;
    reason?: string;
  },
): Promise<{
  revokedCount: number;
  releasedTicketCodes: string[];
}> {
  await ensureTicketSchema(pool);
  await ensureReservationSchema(pool);

  return await inTransaction(pool, async (client) => {
    // Lock order
    const orderRes = await client.query<{
      id: string;
      orderSource: string;
      eventId: string;
    }>(
      `SELECT id, "orderSource", "eventId"
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [input.orderId],
    );

    if (orderRes.rowCount === 0) {
      throw new Error('ไม่พบข้อมูลรายการออกบัตรตรงนี้');
    }

    if (orderRes.rows[0].orderSource !== 'direct_issue') {
      throw new Error('สามารถเพิกถอนบัตรผ่านเมนูนี้ได้เฉพาะบัตรที่ออกตรง (DIR-) เท่านั้น');
    }

    // Select target tickets
    let ticketsQuery = `
      SELECT t.id, t."ticketCode", t.status, t."admissionStatus"
      FROM tickets t
      WHERE t."orderId" = $1
      FOR UPDATE OF t
    `;
    const queryParams: unknown[] = [input.orderId];

    if (input.ticketIds && input.ticketIds.length > 0) {
      ticketsQuery = `
        SELECT t.id, t."ticketCode", t.status, t."admissionStatus"
        FROM tickets t
        WHERE t."orderId" = $1 AND t.id = ANY($2::text[])
        FOR UPDATE OF t
      `;
      queryParams.push(input.ticketIds);
    }

    const ticketsRes = await client.query<{
      id: string;
      ticketCode: string;
      status: string;
      admissionStatus: string;
    }>(ticketsQuery, queryParams);

    if (ticketsRes.rowCount === 0) {
      throw new Error('ไม่พบบัตรที่สามารถดำเนินการได้');
    }

    // Check admission history: cannot revoke tickets that entered
    const targetTicketIds = ticketsRes.rows.map(t => t.id);
    const admCheckRes = await client.query<{ ticketId: string }>(
      `SELECT DISTINCT "ticketId"
       FROM ticket_admission_logs
       WHERE "ticketId" = ANY($1::text[])
         AND action = 'entry'
         AND status = 'success'`,
      [targetTicketIds],
    );

    const admittedIds = new Set(admCheckRes.rows.map(r => r.ticketId));

    const eligibleTickets = ticketsRes.rows.filter(
      t => t.status === 'valid' && !admittedIds.has(t.id) && t.admissionStatus !== 'inside',
    );

    if (eligibleTickets.length === 0) {
      throw new Error('ไม่สามารถยกเลิกบัตรได้ เนื่องจากบัตรถูกใช้งานสแกนเข้างานแล้ว หรือถูกยกเลิกไปแล้ว');
    }

    const eligibleIds = eligibleTickets.map(t => t.id);

    // Update tickets to cancelled
    await client.query(
      `UPDATE tickets
       SET status = 'cancelled', "updatedAt" = now()
       WHERE id = ANY($1::text[])`,
      [eligibleIds],
    );

    // If all tickets in this order are now cancelled, mark the order as cancelled
    const remainingValidRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM tickets
       WHERE "orderId" = $1 AND status != 'cancelled'`,
      [input.orderId],
    );
    if (parseInt(remainingValidRes.rows[0]?.count || '0', 10) === 0) {
      await client.query(
        `UPDATE orders
         SET status = 'cancelled', "updatedAt" = now()
         WHERE id = $1`,
        [input.orderId],
      );
    }

    return {
      revokedCount: eligibleTickets.length,
      releasedTicketCodes: eligibleTickets.map(t => t.ticketCode),
    };
  });
}

export async function getDirectIssuanceEventsOverview(
  pool: Pool,
  organizerId?: string,
): Promise<DirectIssuanceEventOption[]> {
  await ensureEventSchema(pool);
  await ensureTicketSchema(pool);

  const orgFilter = organizerId ? 'AND e."organizerId" = $1' : '';
  const params = organizerId ? [organizerId] : [];

  const res = await pool.query<{
    eventId: string;
    eventTitle: string;
    organizerId: string;
    salesStartTime: Date | null;
    salesEndTime: Date | null;
    organizerName: string;
    organizerEmail: string;
    sessionId: string;
    startTime: Date;
    endTime: Date;
    sessionStatus: string;
    ticketTypeId: string;
    ticketTypeName: string;
    price: number | string;
    quota: number;
    webSold: string;
    directIssued: string;
    returnedQuota: string;
    activeReserved: string;
  }>(
    `SELECT e.id AS "eventId",
            e.title AS "eventTitle",
            e."organizerId",
            e."salesStartTime",
            e."salesEndTime",
            u.name AS "organizerName",
            u.email AS "organizerEmail",
            es.id AS "sessionId",
            es."startTime",
            es."endTime",
            es.status AS "sessionStatus",
            tt.id AS "ticketTypeId",
            tt.name AS "ticketTypeName",
            tt.price,
            tt.quota,
            COALESCE(
              (
                SELECT COUNT(*)::text
                FROM tickets t
                JOIN orders o ON o.id = t."orderId"
                WHERE t."ticketTypeId" = tt.id AND t.status IN ('valid', 'used') AND o."orderSource" = 'web'
              ),
              '0'
            ) AS "webSold",
            COALESCE(
              (
                SELECT COUNT(*)::text
                FROM tickets t
                JOIN orders o ON o.id = t."orderId"
                WHERE t."ticketTypeId" = tt.id AND t.status IN ('valid', 'used') AND o."orderSource" = 'direct_issue'
              ),
              '0'
            ) AS "directIssued",
            COALESCE(
              (
                SELECT COUNT(*)::text
                FROM tickets t
                WHERE t."ticketTypeId" = tt.id AND t.status IN ('refunded', 'cancelled')
              ),
              '0'
            ) AS "returnedQuota",
            COALESCE(
              (
                SELECT SUM(oi2.quantity)::text
                FROM orders o2
                JOIN order_items oi2 ON oi2."orderId" = o2.id
                WHERE oi2."ticketTypeId" = tt.id
                  AND o2.status = 'reserved'
                  AND o2."expiresAt" > now()
              ),
              '0'
            ) AS "activeReserved"
     FROM events e
     JOIN auth_user u ON u.id = e."organizerId"
     JOIN event_sessions es ON es."eventId" = e.id
     JOIN ticket_types tt ON tt."sessionId" = es.id
     WHERE es.status = 'approved' ${orgFilter}
     GROUP BY e.id, e."salesStartTime", e."salesEndTime", u.id, es.id, tt.id
     ORDER BY e."createdAt" DESC, es."startTime" ASC, tt.price DESC`,
    params,
  );

  const eventMap = new Map<string, DirectIssuanceEventOption>();
  const now = new Date();

  for (const row of res.rows) {
    let ev = eventMap.get(row.eventId);
    if (!ev) {
      const isSalesEnded = row.salesEndTime ? now.getTime() > new Date(row.salesEndTime).getTime() : false;
      ev = {
        eventId: row.eventId,
        eventTitle: row.eventTitle,
        organizerId: row.organizerId,
        organizerName: row.organizerName || 'ผู้จัดงาน',
        organizerEmail: row.organizerEmail,
        salesStartTime: row.salesStartTime ? new Date(row.salesStartTime).toISOString() : null,
        salesEndTime: row.salesEndTime ? new Date(row.salesEndTime).toISOString() : null,
        isSalesEnded,
        sessions: [],
      };
      eventMap.set(row.eventId, ev);
    }

    let sess = ev.sessions.find(s => s.sessionId === row.sessionId);
    if (!sess) {
      const isSessionEnded = now.getTime() >= new Date(row.endTime).getTime();
      const isSalesEnded = ev.isSalesEnded ?? false;
      let salesStatusLabel = 'เปิดขายหน้าเว็บ';
      if (isSessionEnded) {
        salesStatusLabel = 'การแสดงสิ้นสุดแล้ว';
      } else if (isSalesEnded) {
        salesStatusLabel = 'ปิดขายหน้าเว็บแล้ว';
      }

      sess = {
        sessionId: row.sessionId,
        startTime: new Date(row.startTime).toISOString(),
        endTime: new Date(row.endTime).toISOString(),
        status: row.sessionStatus,
        isSessionEnded,
        isSalesEnded,
        salesStatusLabel,
        ticketTypes: [],
      };
      ev.sessions.push(sess);
    }

    const quota = Number(row.quota);
    const webSold = parseInt(row.webSold || '0', 10);
    const directIssued = parseInt(row.directIssued || '0', 10);
    const returnedQuota = parseInt(row.returnedQuota || '0', 10);
    const activeReserved = parseInt(row.activeReserved || '0', 10);

    const totalHeld = webSold + directIssued + activeReserved;
    const available = Math.max(0, quota - totalHeld);

    sess.ticketTypes.push({
      ticketTypeId: row.ticketTypeId,
      name: row.ticketTypeName,
      price: Number(row.price),
      quota,
      totalQuota: quota,
      webSold,
      directIssued,
      returnedQuota,
      available,
      remainingQuota: available,
    });
  }

  return Array.from(eventMap.values());
}
