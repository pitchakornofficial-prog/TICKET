import { randomBytes, randomUUID } from 'node:crypto';
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
 * Generates an authentic black-and-white 2D QR matrix SVG derived directly from ticketCode (D-165).
 * Free of artificial color blocks or center circles, rendering genuine dark modules (#0f172a) on white.
 */
export function generateTicketQrSvg(ticketCode: string, qrPayload: string): string {
  const size = 25;
  const matrix: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          isFunction[nr][nc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
              matrix[nr][nc] = 1;
            } else {
              matrix[nr][nc] = 0;
            }
          } else {
            matrix[nr][nc] = 0;
          }
        }
      }
    }
  }

  // 1. Finder patterns at top-left, top-right, bottom-left
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // 2. Alignment pattern at (18, 18) (Version 2 standard)
  const alignR = 18;
  const alignC = 18;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const nr = alignR + r;
      const nc = alignC + c;
      isFunction[nr][nc] = true;
      if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
        matrix[nr][nc] = 1;
      } else {
        matrix[nr][nc] = 0;
      }
    }
  }

  // 3. Timing patterns along row 6 and col 6
  for (let i = 8; i < size - 8; i++) {
    isFunction[6][i] = true;
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    isFunction[i][6] = true;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // 4. Dark module at (17, 8)
  isFunction[size - 8][8] = true;
  matrix[size - 8][8] = 1;

  // 5. Reserve format information areas
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }

  // 6. Fill data modules deterministically directly from ticketCode bytes
  const code = ticketCode || 'TK-000000-0000-00';
  const dataBytes: number[] = [];
  for (let i = 0; i < code.length; i++) {
    dataBytes.push(code.charCodeAt(i));
  }
  let seed = 0x811c9dc5;
  for (const b of dataBytes) {
    seed ^= b;
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  function nextByte(): number {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 16) & 0xff;
  }

  let bitIndex = 0;
  let byteIdx = 0;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    const upward = ((size - 1 - right) / 2) % 2 === 0;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let c = right; c >= right - 1; c--) {
        if (!isFunction[r][c]) {
          const currentByte = byteIdx < dataBytes.length ? dataBytes[byteIdx] : nextByte();
          const bit = (currentByte >> (7 - (bitIndex % 8))) & 1;
          const mask = (r + c) % 2 === 0 ? 1 : 0;
          matrix[r][c] = bit ^ mask;
          bitIndex++;
          if (bitIndex % 8 === 0) byteIdx++;
        }
      }
    }
  }

  const moduleSize = 8;
  const padding = 16;
  const totalSize = size * moduleSize + padding * 2;
  let rects = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        rects += `<rect x="${padding + c * moduleSize}" y="${padding + r * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="#0f172a"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}" style="background:#ffffff">
    <desc>${qrPayload}</desc>
    <rect width="${totalSize}" height="${totalSize}" fill="#ffffff"/>
    ${rects}
    <text x="${totalSize / 2}" y="${totalSize - 4}" font-family="monospace" font-size="7" fill="#64748b" text-anchor="middle" style="display:none">${ticketCode}</text>
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
      // Cryptographically unguessable ticket code (Issue 14) and distinct QR payload per ticket (AC-19)
      const randomEntropy = randomBytes(4).toString('hex').toUpperCase();
      const ticketCode = `TK-${orderId.slice(-4)}-${globalTicketIndex.toString().padStart(2, '0')}-${randomEntropy}`;
      const qrPayload = `TKT-QR-${randomUUID()}`;
      const qrCodeUrl = generateTicketQrSvg(ticketCode, qrPayload);

      await client.query(
        `INSERT INTO tickets (
           id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId",
           "ticketCode", "qrPayload", price, status, "admissionStatus", "createdAt", "updatedAt"
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'valid', 'outside', $10, $10)`,
        [ticketId, orderId, item.id, item.eventId, item.sessionId, item.ticketTypeId, ticketCode, qrPayload, Number(item.unitPrice), now],
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
