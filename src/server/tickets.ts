import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ensureReservationSchema } from './reservation.ts';

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
  createdAt: string;
}

export async function ensureTicketSchema(pool: Pool): Promise<void> {
  await ensureReservationSchema(pool);
  await pool.query(`
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

/**
 * Generates an SVG representation for the ticket QR.
 */
export function generateTicketQrSvg(ticketCode: string, qrPayload: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" style="background:#ffffff;border-radius:6px">
    <desc>${qrPayload}</desc>
    <rect width="200" height="200" fill="#ffffff"/>
    <rect x="15" y="15" width="50" height="50" fill="#0f172a" rx="4"/>
    <rect x="25" y="25" width="30" height="30" fill="#ffffff" rx="2"/>
    <rect x="33" y="33" width="14" height="14" fill="#0f172a"/>
    <rect x="135" y="15" width="50" height="50" fill="#0f172a" rx="4"/>
    <rect x="145" y="25" width="30" height="30" fill="#ffffff" rx="2"/>
    <rect x="153" y="33" width="14" height="14" fill="#0f172a"/>
    <rect x="15" y="135" width="50" height="50" fill="#0f172a" rx="4"/>
    <rect x="25" y="145" width="30" height="30" fill="#ffffff" rx="2"/>
    <rect x="33" y="153" width="14" height="14" fill="#0f172a"/>
    <rect x="80" y="20" width="35" height="15" fill="#1848ed"/>
    <rect x="75" y="45" width="20" height="25" fill="#0f172a"/>
    <rect x="105" y="45" width="20" height="25" fill="#1848ed"/>
    <rect x="75" y="75" width="50" height="50" fill="#0f172a" rx="4"/>
    <circle cx="100" cy="100" r="12" fill="#ffffff"/>
    <rect x="20" y="80" width="45" height="15" fill="#0f172a"/>
    <rect x="135" y="80" width="45" height="15" fill="#0f172a"/>
    <rect x="80" y="135" width="35" height="20" fill="#1848ed"/>
    <rect x="125" y="135" width="55" height="45" fill="#0f172a"/>
    <text x="100" y="192" font-family="sans-serif" font-size="8" fill="#64748b" text-anchor="middle">${ticketCode}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Issues tickets atomically for an order inside a transaction (AC-17, AC-19).
 */
export async function issueTicketsForOrder(
  client: PoolClient,
  orderId: string,
  now = new Date(),
): Promise<TicketDetail[]> {
  // Check if tickets already exist for this order (AC-18 idempotency)
  const existingTicketsRes = await client.query(
    `SELECT t.id, t."orderId", t."orderItemId", t."eventId", t."sessionId",
            t."ticketTypeId", t."ticketCode", t."qrPayload", t.status, t."admissionStatus",
            t."createdAt", tt.name as "ticketTypeName", tt.price as "ticketPrice",
            o."buyerName", o."buyerEmail", o."buyerPhone",
            es."startTime" as "sessionStartTime", es."endTime" as "sessionEndTime",
            e.location, e.title as "eventTitle", e."ticketTemplateUrl", e."posterUrl" as "eventPosterUrl"
     FROM tickets t
     JOIN ticket_types tt ON t."ticketTypeId" = tt.id
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

  // Read order items to issue exact number of tickets
  const itemsRes = await client.query(
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

  const issuedTickets: TicketDetail[] = [];
  let globalTicketIndex = 1;

  for (const item of itemsRes.rows) {
    for (let i = 0; i < item.quantity; i++) {
      const ticketId = `TKT-${randomUUID().slice(0, 8).toUpperCase()}`;
      // Unique ticket code and distinct QR payload per ticket (AC-19)
      const ticketCode = `TK-${orderId.slice(-6)}-${item.ticketTypeId.slice(-4)}-${globalTicketIndex.toString().padStart(2, '0')}`;
      const qrPayload = `TKT-QR-${randomUUID()}`;
      const qrCodeUrl = generateTicketQrSvg(ticketCode, qrPayload);

      await client.query(
        `INSERT INTO tickets (
           id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId",
           "ticketCode", "qrPayload", status, "admissionStatus", "createdAt", "updatedAt"
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'valid', 'outside', $9, $9)`,
        [ticketId, orderId, item.id, item.eventId, item.sessionId, item.ticketTypeId, ticketCode, qrPayload, now],
      );

      issuedTickets.push({
        id: ticketId,
        orderId,
        orderItemId: item.id,
        eventId: item.eventId,
        sessionId: item.sessionId,
        ticketTypeId: item.ticketTypeId,
        ticketTypeName: item.ticketTypeName,
        ticketPrice: Number(item.unitPrice),
        ticketCode,
        qrPayload,
        qrCodeUrl,
        status: 'valid',
        admissionStatus: 'outside',
        buyerName: item.buyerName,
        buyerEmail: item.buyerEmail,
        buyerPhone: item.buyerPhone,
        sessionStartTime: new Date(item.sessionStartTime).toISOString(),
        sessionEndTime: new Date(item.sessionEndTime).toISOString(),
        location: item.location,
        eventTitle: item.eventTitle,
        createdAt: now.toISOString(),
      });

      globalTicketIndex++;
    }
  }

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
            t."createdAt", tt.name as "ticketTypeName", tt.price as "ticketPrice",
            o."buyerName", o."buyerEmail", o."buyerPhone",
            es."startTime" as "sessionStartTime", es."endTime" as "sessionEndTime",
            e.location, e.title as "eventTitle", e."ticketTemplateUrl", e."posterUrl" as "eventPosterUrl"
     FROM tickets t
     JOIN ticket_types tt ON t."ticketTypeId" = tt.id
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
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}
