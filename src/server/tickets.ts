import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ensureReservationSchema } from './reservation.ts';
import { createTicketQrMatrix } from './qr-code.ts';

export interface TicketDetail {
  id: string;
  orderId: string;
  orderItemId: string;
  eventId: string;
  sessionId: string;
  ticketTypeId: string;
  ticketTypeName: string;
  ticketPrice: number;
  ticketCode: string;
  qrPayload: string;
  qrCodeUrl: string;
  status: 'valid' | 'used' | 'refunded' | 'cancelled';
  admissionStatus: 'outside' | 'inside';
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  sessionStartTime: string;
  sessionEndTime: string;
  location: string;
  eventTitle: string;
  ticketTemplateUrl?: string | null;
  eventPosterUrl?: string | null;
  coverBannerUrl?: string | null;
  createdAt: string;
}

const ticketSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureTicketSchema(pool: Pool): Promise<void> {
  const existing = ticketSchemaPromises.get(pool);
  if (existing) {
    return existing;
  }
  const promise = (async () => {
    try {
      await ensureReservationSchema(pool);
    } catch (err) {
      ticketSchemaPromises.delete(pool);
      throw err;
    }
  })();
  ticketSchemaPromises.set(pool, promise);
  return promise;
}

/**
 * Generates a scannable QR Code Model 2 SVG containing the actual ticket payload.
 * The four-module quiet zone and correction level M make the matrix suitable for print.
 */
export function generateTicketQrSvg(ticketCode: string, qrPayload: string): string {
  const matrix = createTicketQrMatrix(qrPayload);
  const size = matrix.length;
  const moduleSize = 8;
  const padding = 4 * moduleSize;
  const totalSize = size * moduleSize + padding * 2;
  let pathD = '';
  for (let r = 0; r < size; r++) {
    const y = padding + r * moduleSize;
    let c = 0;
    while (c < size) {
      if (matrix[r][c] === 1) {
        const startC = c;
        c++;
        while (c < size && matrix[r][c] === 1) c++;
        pathD += `M${padding + startC * moduleSize} ${y}h${(c - startC) * moduleSize}v${moduleSize}h-${(c - startC) * moduleSize}z`;
      } else {
        c++;
      }
    }
  }

  const escapeXml = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
  const rx = Math.round(moduleSize * 1.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}" role="img" aria-label="Ticket QR code"><desc>${escapeXml(qrPayload)}</desc><rect width="${totalSize}" height="${totalSize}" rx="${rx}" ry="${rx}" fill="#ffffff"/><path fill="#000000" d="${pathD}"/><text x="${totalSize / 2}" y="${totalSize - 4}" font-family="monospace" font-size="7" fill="#64748b" text-anchor="middle" style="display:none">${escapeXml(ticketCode || 'TK-000000-0000-00')}</text></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface TicketIssuanceItemRow {
  id: string;
  ticketTypeId: string;
  quantity: number;
  unitPrice: number | string;
  eventId: string;
  sessionId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  ticketTypeName: string;
  sessionStartTime: Date | string;
  sessionEndTime: Date | string;
  location: string;
  eventTitle: string;
}

export function buildTicketsToIssue(
  orderId: string,
  items: TicketIssuanceItemRow[],
  now = new Date(),
): {
  issuedTickets: TicketDetail[];
  ticketIds: string[];
  orderItemIds: string[];
  eventIds: string[];
  sessionIds: string[];
  ticketTypeIds: string[];
  ticketCodes: string[];
  qrPayloads: string[];
  prices: number[];
} {
  const issuedTickets: TicketDetail[] = [];
  const ticketIds: string[] = [];
  const orderItemIds: string[] = [];
  const eventIds: string[] = [];
  const sessionIds: string[] = [];
  const ticketTypeIds: string[] = [];
  const ticketCodes: string[] = [];
  const qrPayloads: string[] = [];
  const prices: number[] = [];
  let globalTicketIndex = 1;
  const createdIso = now.toISOString();

  for (const item of items) {
    const unitPrice = Number(item.unitPrice);
    const sessionStartIso = new Date(item.sessionStartTime).toISOString();
    const sessionEndIso = new Date(item.sessionEndTime).toISOString();

    for (let i = 0; i < item.quantity; i++) {
      const ticketId = `TKT-${randomUUID().slice(0, 8).toUpperCase()}`;
      // Cryptographically unguessable ticket code (Issue 14) and distinct QR payload per ticket (AC-19)
      const randomEntropy = randomBytes(4).toString('hex').toUpperCase();
      const ticketCode = `TK-${orderId.slice(-4)}-${globalTicketIndex.toString().padStart(2, '0')}-${randomEntropy}`;
      const qrPayload = `TKT-QR-${randomUUID()}`;
      const qrCodeUrl = generateTicketQrSvg(ticketCode, qrPayload);

      ticketIds.push(ticketId);
      orderItemIds.push(item.id);
      eventIds.push(item.eventId);
      sessionIds.push(item.sessionId);
      ticketTypeIds.push(item.ticketTypeId);
      ticketCodes.push(ticketCode);
      qrPayloads.push(qrPayload);
      prices.push(unitPrice);

      issuedTickets.push({
        id: ticketId,
        orderId,
        orderItemId: item.id,
        eventId: item.eventId,
        sessionId: item.sessionId,
        ticketTypeId: item.ticketTypeId,
        ticketTypeName: item.ticketTypeName,
        ticketPrice: unitPrice,
        ticketCode,
        qrPayload,
        qrCodeUrl,
        status: 'valid',
        admissionStatus: 'outside',
        buyerName: item.buyerName,
        buyerEmail: item.buyerEmail,
        buyerPhone: item.buyerPhone,
        sessionStartTime: sessionStartIso,
        sessionEndTime: sessionEndIso,
        location: item.location,
        eventTitle: item.eventTitle,
        createdAt: createdIso,
      });

      globalTicketIndex++;
    }
  }

  return {
    issuedTickets,
    ticketIds,
    orderItemIds,
    eventIds,
    sessionIds,
    ticketTypeIds,
    ticketCodes,
    qrPayloads,
    prices,
  };
}

/**
 * Issues tickets atomically for an order inside a transaction (AC-17, AC-19).
 */
export async function issueTicketsForOrder(
  client: PoolClient,
  orderId: string,
  now = new Date(),
  options?: { skipExistingCheck?: boolean },
): Promise<TicketDetail[]> {
  if (!options?.skipExistingCheck) {
    // Check if tickets already exist for this order (AC-18 idempotency)
    const existingTicketsRes = await client.query(
      `SELECT t.id, t."orderId", t."orderItemId", t."eventId", t."sessionId",
              t."ticketTypeId", t."ticketCode", t."qrPayload", t.status, t."admissionStatus",
              t."createdAt", tt.name as "ticketTypeName", COALESCE(t.price, oi."unitPrice") as "ticketPrice",
              o."buyerName", o."buyerEmail", o."buyerPhone",
              es."startTime" as "sessionStartTime", es."endTime" as "sessionEndTime",
              e.location, e.title as "eventTitle", e."ticketTemplateUrl", e."posterUrl" as "eventPosterUrl"
       FROM tickets t
       JOIN ticket_types tt ON t."ticketTypeId" = tt.id
       JOIN order_items oi ON oi.id = t."orderItemId"
       JOIN orders o ON t."orderId" = o.id
       JOIN event_sessions es ON t."sessionId" = es.id
       JOIN events e ON t."eventId" = e.id
       WHERE t."orderId" = $1
       ORDER BY t."ticketCode" ASC`,
      [orderId],
    );

    if (existingTicketsRes.rowCount && existingTicketsRes.rowCount > 0) {
      return existingTicketsRes.rows.map(r => ({
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
        status: r.status as 'valid',
        admissionStatus: r.admissionStatus as 'outside',
        buyerName: r.buyerName,
        buyerEmail: r.buyerEmail,
        buyerPhone: r.buyerPhone,
        sessionStartTime: new Date(r.sessionStartTime).toISOString(),
        sessionEndTime: new Date(r.sessionEndTime).toISOString(),
        location: r.location,
        eventTitle: r.eventTitle,
        createdAt: new Date(r.createdAt).toISOString(),
      }));
    }
  }

  // Read order items to issue exact number of tickets
  const itemsRes = await client.query<TicketIssuanceItemRow>(
    `SELECT oi.id, oi."ticketTypeId", oi.quantity, oi."unitPrice",
            o."eventId", o."sessionId", o."buyerName", o."buyerEmail", o."buyerPhone",
            tt.name as "ticketTypeName",
            es."startTime" as "sessionStartTime", es."endTime" as "sessionEndTime",
            e.location, e.title as "eventTitle"
     FROM order_items oi
     JOIN orders o ON oi."orderId" = o.id
     JOIN ticket_types tt ON oi."ticketTypeId" = tt.id
     JOIN event_sessions es ON o."sessionId" = es.id
     JOIN events e ON o."eventId" = e.id
     WHERE oi."orderId" = $1`,
    [orderId],
  );

  if (itemsRes.rowCount === 0) {
    throw new Error('ไม่พบรายการประเภทบัตรในคำสั่งซื้อนี้');
  }

  const {
    issuedTickets,
    ticketIds,
    orderItemIds,
    eventIds,
    sessionIds,
    ticketTypeIds,
    ticketCodes,
    qrPayloads,
    prices,
  } = buildTicketsToIssue(orderId, itemsRes.rows, now);

  await client.query(
    `INSERT INTO tickets (
       id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId",
       "ticketCode", "qrPayload", price, status, "admissionStatus", "createdAt", "updatedAt"
     )
     SELECT id, $2, "orderItemId", "eventId", "sessionId", "ticketTypeId",
            "ticketCode", "qrPayload", price, 'valid', 'outside', $10, $10
     FROM UNNEST($1::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::numeric[])
       AS t(id, "orderItemId", "eventId", "sessionId", "ticketTypeId", "ticketCode", "qrPayload", price)`,
    [
      ticketIds,
      orderId,
      orderItemIds,
      eventIds,
      sessionIds,
      ticketTypeIds,
      ticketCodes,
      qrPayloads,
      prices,
      now,
    ],
  );

  return issuedTickets;
}

/**
 * Gets all issued tickets for an order.
 */
export async function getOrderTickets(pool: Pool, orderId: string): Promise<TicketDetail[]> {
  await ensureTicketSchema(pool);
  const res = await pool.query(
    `SELECT t.id, t."orderId", t."orderItemId", t."eventId", t."sessionId",
            t."ticketTypeId", t."ticketCode", t."qrPayload", t.status, t."admissionStatus",
            t."createdAt", tt.name as "ticketTypeName", COALESCE(t.price, oi."unitPrice") as "ticketPrice",
            o."buyerName", o."buyerEmail", o."buyerPhone",
            es."startTime" as "sessionStartTime", es."endTime" as "sessionEndTime",
            e.location, e.title as "eventTitle", e."ticketTemplateUrl", e."posterUrl" as "eventPosterUrl",
            e."coverBannerUrl"
     FROM tickets t
     JOIN ticket_types tt ON t."ticketTypeId" = tt.id
     JOIN order_items oi ON oi.id = t."orderItemId"
     JOIN orders o ON t."orderId" = o.id
     JOIN event_sessions es ON t."sessionId" = es.id
     JOIN events e ON t."eventId" = e.id
     WHERE t."orderId" = $1
     ORDER BY t."ticketCode" ASC`,
    [orderId],
  );

  return res.rows.map(r => ({
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
    status: r.status as 'valid',
    admissionStatus: r.admissionStatus as 'outside',
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhone: r.buyerPhone,
    sessionStartTime: new Date(r.sessionStartTime).toISOString(),
    sessionEndTime: new Date(r.sessionEndTime).toISOString(),
    location: r.location,
    eventTitle: r.eventTitle,
    ticketTemplateUrl: r.ticketTemplateUrl || null,
    eventPosterUrl: r.eventPosterUrl || null,
    coverBannerUrl: r.coverBannerUrl || null,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

/**
 * Gets a single issued ticket by ID or ticket code.
 */
export async function getTicketById(pool: Pool, ticketIdOrCode: string): Promise<TicketDetail | null> {
  await ensureTicketSchema(pool);
  const res = await pool.query(
    `SELECT t.id, t."orderId", t."orderItemId", t."eventId", t."sessionId",
            t."ticketTypeId", t."ticketCode", t."qrPayload", t.status, t."admissionStatus",
            t."createdAt", tt.name as "ticketTypeName", COALESCE(t.price, oi."unitPrice") as "ticketPrice",
            o."buyerName", o."buyerEmail", o."buyerPhone",
            es."startTime" as "sessionStartTime", es."endTime" as "sessionEndTime",
            e.location, e.title as "eventTitle", e."ticketTemplateUrl", e."posterUrl" as "eventPosterUrl",
            e."coverBannerUrl"
     FROM tickets t
     JOIN ticket_types tt ON t."ticketTypeId" = tt.id
     JOIN order_items oi ON oi.id = t."orderItemId"
     JOIN orders o ON t."orderId" = o.id
     JOIN event_sessions es ON t."sessionId" = es.id
     JOIN events e ON t."eventId" = e.id
     WHERE t.id = $1 OR t."ticketCode" = $1
     LIMIT 1`,
    [ticketIdOrCode],
  );

  if (res.rowCount === 0) return null;
  const r = res.rows[0];

  return {
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
    status: r.status as 'valid',
    admissionStatus: r.admissionStatus as 'outside',
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhone: r.buyerPhone,
    sessionStartTime: new Date(r.sessionStartTime).toISOString(),
    sessionEndTime: new Date(r.sessionEndTime).toISOString(),
    location: r.location,
    eventTitle: r.eventTitle,
    ticketTemplateUrl: r.ticketTemplateUrl || null,
    eventPosterUrl: r.eventPosterUrl || null,
    coverBannerUrl: r.coverBannerUrl || null,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}
