import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from './database.ts';
import {
  calculateCustomerFee,
  roundHalfUp,
  type CustomerFeeMode,
  ensureFeeSchema,
} from './fees.ts';
import { getVerifiedGuestSession } from './guest-otp.ts';

// 15-minute reservation hold window (G-05, AC-13)
export const RESERVATION_HOLD_SECONDS = 15 * 60; // 900 seconds

export interface ReservationItemInput {
  ticketTypeId: string;
  quantity: number;
}

export interface CreateReservationInput {
  verifiedToken: string;
  eventId: string;
  sessionId: string;
  items: ReservationItemInput[];
}

export interface OrderItemDetail {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface OrderReservationDetail {
  id: string;
  eventId: string;
  sessionId: string;
  eventTitle?: string;
  eventLocation?: string;
  sessionStartTime?: string;
  sessionAdmissionStartTime?: string;
  buyerEmail: string;
  buyerName: string;
  buyerPhone: string;
  status: 'reserved' | 'paid' | 'expired' | 'cancelled' | 'payment_exception';
  items: OrderItemDetail[];
  subtotal: number;
  customerFeeMode: CustomerFeeMode;
  customerFeeRate: number;
  customerFee: number;
  total: number;
  reservedAt: string;
  expiresAt: string;
}

export async function ensureReservationSchema(pool: Pool): Promise<void> {
  await ensureFeeSchema(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      "buyerEmail" TEXT NOT NULL,
      "buyerName" TEXT NOT NULL,
      "buyerPhone" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      subtotal NUMERIC(12, 2) NOT NULL,
      "customerFee" NUMERIC(12, 2) NOT NULL,
      total NUMERIC(12, 2) NOT NULL,
      "customerFeeMode" TEXT NOT NULL,
      "customerFeeRate" NUMERIC(12, 2) NOT NULL,
      "reservedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_orders_event_session ON orders("eventId", "sessionId");
    CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders("buyerEmail");
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      "ticketTypeId" TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      "unitPrice" NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_orderId ON order_items("orderId");
    CREATE INDEX IF NOT EXISTS idx_order_items_ticketTypeId ON order_items("ticketTypeId");

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      "orderItemId" TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      "ticketTypeId" TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
      "ticketCode" TEXT NOT NULL UNIQUE,
      "qrPayload" TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'valid',
      "admissionStatus" TEXT NOT NULL DEFAULT 'outside',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets("orderId");
    CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets("sessionId");
    CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets("ticketTypeId");
    CREATE INDEX IF NOT EXISTS idx_tickets_code ON tickets("ticketCode");
    CREATE INDEX IF NOT EXISTS idx_tickets_qr_payload ON tickets("qrPayload");
  `);
}

export async function getBuyerTicketCountForEvent(
  pool: Pool | PoolClient,
  eventId: string,
  buyerEmail: string,
  _buyerPhone?: string,
  now = new Date(),
): Promise<number> {
  const emailNorm = (buyerEmail || '').trim().toLowerCase();

  if (!emailNorm) {
    return 0;
  }

  const res = await pool.query(
    `SELECT GREATEST(0,
       COALESCE(SUM(oi.quantity), 0)::int -
       COALESCE((
         SELECT count(*)::int
         FROM tickets t
         JOIN orders o2 ON t."orderId" = o2.id
         WHERE o2."eventId" = $1
           AND LOWER(TRIM(o2."buyerEmail")) = $2
           AND t.status = 'refunded'
       ), 0)
     )::int as total
     FROM orders o
     JOIN order_items oi ON o.id = oi."orderId"
     WHERE o."eventId" = $1
       AND LOWER(TRIM(o."buyerEmail")) = $2
       AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $3))`,
    [eventId, emailNorm, now],
  );

  return Number(res.rows[0]?.total) || 0;
}

export async function createReservation(
  pool: Pool,
  input: CreateReservationInput,
  now = new Date(),
): Promise<OrderReservationDetail> {
  // AC-12: Must provide valid OTP verified token
  const verifiedSession = await getVerifiedGuestSession(pool, input.verifiedToken, now);
  if (!verifiedSession) {
    throw new Error('กรุณายืนยันตัวตนผ่าน OTP ก่อนดำเนินการกันบัตร');
  }

  // Input validation
  if (!input.items || input.items.length === 0) {
    throw new Error('กรุณาเลือกประเภทบัตรและจำนวนอย่างน้อย 1 ใบ');
  }

  const sanitizedItems = input.items
    .map(i => ({ ticketTypeId: i.ticketTypeId?.trim(), quantity: Number(i.quantity) }))
    .filter(i => i.quantity > 0);

  if (sanitizedItems.length === 0) {
    throw new Error('กรุณาเลือกจำนวนบัตรมากกว่า 0 ใบ');
  }

  const totalTickets = sanitizedItems.reduce((acc, i) => acc + i.quantity, 0);

  await ensureReservationSchema(pool);

  return inTransaction(pool, async (client: PoolClient) => {
    // 1. Verify Event existence and status
    const eventRes = await client.query(
      'SELECT id, title, "limitPerOrder", status FROM events WHERE id = $1',
      [input.eventId],
    );
    if (eventRes.rowCount === 0) {
      throw new Error('ไม่พบคอนเสิร์ตที่ระบุ');
    }
    const event = eventRes.rows[0];

    // AC-10, AC-106: Limit check against total tickets in order
    const limitPerOrder = Number(event.limitPerOrder) || 4;
    if (totalTickets > limitPerOrder) {
      throw new Error(`จำนวนบัตรรวมทุกประเภท (${totalTickets} ใบ) เกินจำกัดต่อคำสั่งซื้อ (${limitPerOrder} ใบ)`);
    }

    // D-59: Anti-Scalping Cumulative Buyer Limit check across all orders for this event
    const alreadyPurchased = await getBuyerTicketCountForEvent(
      client,
      input.eventId,
      verifiedSession.email,
      verifiedSession.phone,
      now,
    );

    if (alreadyPurchased >= limitPerOrder) {
      throw new Error(
        `ท่านได้สั่งซื้อบัตรคอนเสิร์ตนี้ครบตามจำนวนจำกัดแล้ว (${alreadyPurchased} / ${limitPerOrder} ใบ สำหรับอีเมลนี้) เพื่อกระจายสิทธิ์ให้แก่ผู้ชมท่านอื่น`,
      );
    }

    if (alreadyPurchased + totalTickets > limitPerOrder) {
      const remainingQuota = Math.max(0, limitPerOrder - alreadyPurchased);
      throw new Error(
        `ท่านได้สั่งซื้อหรือมีรายการจองบัตรคอนเสิร์ตนี้ไปแล้ว ${alreadyPurchased} ใบ ไม่สามารถซื้อเพิ่มอีก ${totalTickets} ใบได้ (สามารถซื้อเพิ่มได้อีกไม่เกิน ${remainingQuota} ใบ เพื่อไม่ให้เกินเพดานจำกัด ${limitPerOrder} ใบ ต่อหนึ่งท่านในคอนเสิร์ตนี้)`,
      );
    }

    // 2. Verify Session belongs to this event and is approved
    const sessionRes = await client.query(
      'SELECT id, status FROM event_sessions WHERE id = $1 AND "eventId" = $2',
      [input.sessionId, input.eventId],
    );
    if (sessionRes.rowCount === 0) {
      throw new Error('ไม่พบรอบการแสดงที่ระบุในคอนเสิร์ตนี้');
    }
    if (sessionRes.rows[0].status === 'cancelled') {
      throw new Error('รอบการแสดงนี้ถูกยกเลิกแล้ว ไม่สามารถทำการจองบัตรได้ (AC-35)');
    }
    if (sessionRes.rows[0].status !== 'approved') {
      throw new Error('รอบการแสดงนี้ยังไม่เปิดจำหน่าย');
    }

    // 3. Lock ticket types for update to guarantee atomicity under concurrent requests (AC-14, AC-61)
    const ticketTypeIds = sanitizedItems.map(i => i.ticketTypeId);
    const ttRes = await client.query(
      `SELECT id, name, price, quota, "sessionId"
       FROM ticket_types
       WHERE id = ANY($1) AND "sessionId" = $2
       FOR UPDATE`,
      [ticketTypeIds, input.sessionId],
    );

    if (ttRes.rowCount !== ticketTypeIds.length) {
      // AC-06: Sibling session tickets are rejected
      throw new Error('มีประเภทบัตรที่ไม่ได้อยู่ในรอบการแสดงนี้');
    }

    const ticketTypeMap = new Map(ttRes.rows.map(r => [r.id, r]));

    // 4. Check available quota for each requested ticket type
    const orderItemsToInsert: {
      id: string;
      ticketTypeId: string;
      ticketTypeName: string;
      unitPrice: number;
      quantity: number;
      subtotal: number;
    }[] = [];

    let orderSubtotal = 0;

    for (const item of sanitizedItems) {
      const tt = ticketTypeMap.get(item.ticketTypeId);
      if (!tt) {
        throw new Error('ไม่พบข้อมูลประเภทบัตร');
      }

      // Query currently held/paid quota for this ticket type (subtracting refunded tickets AC-36, AC-90)
      const heldRes = await client.query(
        `SELECT GREATEST(0,
           coalesce(sum(oi.quantity), 0)::int -
           coalesce((SELECT count(*)::int FROM tickets t WHERE t."ticketTypeId" = $1 AND t.status = 'refunded'), 0)
         )::int as held
         FROM order_items oi
         JOIN orders o ON oi."orderId" = o.id
         WHERE oi."ticketTypeId" = $1
           AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $2))`,
        [item.ticketTypeId, now],
      );

      const held = Number(heldRes.rows[0].held) || 0;
      const availableQuota = Number(tt.quota) - held;

      // AC-14, AC-61: If any requested type has insufficient quota, fail immediately (all-or-nothing)
      if (availableQuota < item.quantity) {
        throw new Error(`บัตรประเภท "${tt.name}" เหลือไม่เพียงพอ (เหลือ ${Math.max(0, availableQuota)} ใบ)`);
      }

      const unitPrice = Number(tt.price);
      const itemSubtotal = roundHalfUp(unitPrice * item.quantity);
      orderSubtotal = roundHalfUp(orderSubtotal + itemSubtotal);

      orderItemsToInsert.push({
        id: randomUUID(),
        ticketTypeId: tt.id,
        ticketTypeName: tt.name,
        unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
      });
    }

    // 5. Lock organizer fee atomically on first reservation (G-49, AC-111)
    const feeRes = await client.query(
      `SELECT "organizerFeeMode", "organizerFeeRate", "customerFeeMode", "customerFeeRate", "organizerFeeLocked"
       FROM event_fee_settings
       WHERE "eventId" = $1
       FOR UPDATE`,
      [input.eventId],
    );

    let customerFeeMode: CustomerFeeMode = 'per_ticket';
    let customerFeeRate = 0;

    if (feeRes.rowCount === 0) {
      // Initialize default fee settings with organizerFeeLocked = true
      await client.query(
        `INSERT INTO event_fee_settings ("eventId", "organizerFeeLocked", "updatedAt")
         VALUES ($1, TRUE, now())`,
        [input.eventId],
      );
    } else {
      const row = feeRes.rows[0];
      customerFeeMode = (row.customerFeeMode || 'per_ticket') as CustomerFeeMode;
      customerFeeRate = Number(row.customerFeeRate) || 0;

      if (!row.organizerFeeLocked) {
        await client.query(
          `UPDATE event_fee_settings
           SET "organizerFeeLocked" = TRUE, "updatedAt" = now()
           WHERE "eventId" = $1`,
          [input.eventId],
        );
      }
    }

    // 6. Calculate exact customer fee and total (AC-69)
    const { fee: customerFee, total: orderTotal } = calculateCustomerFee(
      customerFeeMode,
      customerFeeRate,
      totalTickets,
      orderSubtotal,
    );

    // 7. Create Order with 15-minute deadline (AC-13)
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const expiresAt = new Date(now.getTime() + RESERVATION_HOLD_SECONDS * 1000);

    await client.query(
      `INSERT INTO orders (
         id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
         status, subtotal, "customerFee", total, "customerFeeMode", "customerFeeRate",
         "reservedAt", "expiresAt", "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'reserved', $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
      [
        orderId,
        input.eventId,
        input.sessionId,
        verifiedSession.email,
        verifiedSession.name,
        verifiedSession.phone,
        orderSubtotal,
        customerFee,
        orderTotal,
        customerFeeMode,
        customerFeeRate,
        now,
        expiresAt,
        now,
      ],
    );

    // 8. Insert Order Items
    for (const item of orderItemsToInsert) {
      await client.query(
        `INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.id, orderId, item.ticketTypeId, item.quantity, item.unitPrice, item.subtotal],
      );
    }

    return {
      id: orderId,
      eventId: input.eventId,
      sessionId: input.sessionId,
      buyerEmail: verifiedSession.email,
      buyerName: verifiedSession.name,
      buyerPhone: verifiedSession.phone,
      status: 'reserved',
      items: orderItemsToInsert,
      subtotal: orderSubtotal,
      customerFeeMode,
      customerFeeRate,
      customerFee,
      total: orderTotal,
      reservedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  });
}

export async function expireOrders(pool: Pool, now = new Date()): Promise<number> {
  await ensureReservationSchema(pool);
  const res = await pool.query(
    `UPDATE orders
     SET status = 'expired', "updatedAt" = $1
     WHERE status = 'reserved' AND "expiresAt" <= $1`,
    [now],
  );
  return res.rowCount ?? 0;
}

export async function getTicketTypeAvailableQuota(
  pool: Pool,
  ticketTypeId: string,
  now = new Date(),
): Promise<{ totalQuota: number; heldQuota: number; availableQuota: number }> {
  await ensureReservationSchema(pool);
  const res = await pool.query(
    `SELECT tt.quota as "totalQuota",
            GREATEST(0, COALESCE(
              (SELECT SUM(oi.quantity)::int
               FROM order_items oi
               JOIN orders o ON oi."orderId" = o.id
               WHERE oi."ticketTypeId" = tt.id
                 AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $2))
              ), 0
            ) - COALESCE(
              (SELECT COUNT(*)::int
               FROM tickets t
               WHERE t."ticketTypeId" = tt.id AND t.status = 'refunded'
              ), 0
            )) as "heldQuota"
     FROM ticket_types tt
     WHERE tt.id = $1`,
    [ticketTypeId, now],
  );
  if (res.rowCount === 0) {
    throw new Error('ไม่พบประเภทบัตรที่ระบุ');
  }
  const totalQuota = Number(res.rows[0].totalQuota) || 0;
  const heldQuota = Number(res.rows[0].heldQuota) || 0;
  const availableQuota = Math.max(0, totalQuota - heldQuota);
  return { totalQuota, heldQuota, availableQuota };
}

export async function getOrderReservation(
  pool: Pool,
  orderId: string,
  now = new Date(),
): Promise<OrderReservationDetail | null> {
  await ensureReservationSchema(pool);

  // Transition to expired atomically in DB if past deadline (AC-71)
  await pool.query(
    `UPDATE orders
     SET status = 'expired', "updatedAt" = $2
     WHERE id = $1 AND status = 'reserved' AND "expiresAt" <= $2`,
    [orderId, now],
  );

  const orderRes = await pool.query(
    `SELECT o.id, o."eventId", o."sessionId", o."buyerEmail", o."buyerName", o."buyerPhone",
            o.status, o.subtotal, o."customerFee", o.total, o."customerFeeMode", o."customerFeeRate",
            o."reservedAt", o."expiresAt",
            e.title as "eventTitle", e.location as "eventLocation",
            s."startTime" as "sessionStartTime", s."admissionStartTime" as "sessionAdmissionStartTime"
     FROM orders o
     JOIN events e ON o."eventId" = e.id
     JOIN event_sessions s ON o."sessionId" = s.id
     WHERE o.id = $1`,
    [orderId],
  );

  if (orderRes.rowCount === 0) return null;
  const o = orderRes.rows[0];

  let status = o.status as 'reserved' | 'paid' | 'expired' | 'cancelled';
  const expiresAt = new Date(o.expiresAt);
  if (status === 'reserved' && expiresAt.getTime() <= now.getTime()) {
    status = 'expired';
  }

  const itemsRes = await pool.query(
    `SELECT oi.id, oi."ticketTypeId", tt.name as "ticketTypeName",
            oi."unitPrice", oi.quantity, oi.subtotal
     FROM order_items oi
     JOIN ticket_types tt ON oi."ticketTypeId" = tt.id
     WHERE oi."orderId" = $1`,
    [orderId],
  );

  return {
    id: o.id,
    eventId: o.eventId,
    sessionId: o.sessionId,
    eventTitle: o.eventTitle || undefined,
    eventLocation: o.eventLocation || undefined,
    sessionStartTime: o.sessionStartTime ? new Date(o.sessionStartTime).toISOString() : undefined,
    sessionAdmissionStartTime: o.sessionAdmissionStartTime ? new Date(o.sessionAdmissionStartTime).toISOString() : undefined,
    buyerEmail: o.buyerEmail,
    buyerName: o.buyerName,
    buyerPhone: o.buyerPhone,
    status,
    items: itemsRes.rows.map(r => ({
      id: r.id,
      ticketTypeId: r.ticketTypeId,
      ticketTypeName: r.ticketTypeName,
      unitPrice: Number(r.unitPrice),
      quantity: Number(r.quantity),
      subtotal: Number(r.subtotal),
    })),
    subtotal: Number(o.subtotal),
    customerFeeMode: o.customerFeeMode as CustomerFeeMode,
    customerFeeRate: Number(o.customerFeeRate),
    customerFee: Number(o.customerFee),
    total: Number(o.total),
    reservedAt: o.reservedAt.toISOString(),
    expiresAt: o.expiresAt.toISOString(),
  };
}
