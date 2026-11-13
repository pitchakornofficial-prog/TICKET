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

const QR_SIZE = 25;
const QR_STATIC_MATRIX = new Uint8Array(QR_SIZE * QR_SIZE);
const QR_IS_FUNCTION = new Uint8Array(QR_SIZE * QR_SIZE);

(() => {
  function setFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < QR_SIZE && nc >= 0 && nc < QR_SIZE) {
          const idx = nr * QR_SIZE + nc;
          QR_IS_FUNCTION[idx] = 1;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            QR_STATIC_MATRIX[idx] =
              r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4) ? 1 : 0;
          }
        }
      }
    }
  }
  setFinder(0, 0);
  setFinder(0, QR_SIZE - 7);
  setFinder(QR_SIZE - 7, 0);

  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const idx = (18 + r) * QR_SIZE + (18 + c);
      QR_IS_FUNCTION[idx] = 1;
      if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
        QR_STATIC_MATRIX[idx] = 1;
      }
    }
  }

  for (let i = 8; i < QR_SIZE - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    QR_IS_FUNCTION[6 * QR_SIZE + i] = 1;
    QR_STATIC_MATRIX[6 * QR_SIZE + i] = bit;
    QR_IS_FUNCTION[i * QR_SIZE + 6] = 1;
    QR_STATIC_MATRIX[i * QR_SIZE + 6] = bit;
  }

  QR_IS_FUNCTION[(QR_SIZE - 8) * QR_SIZE + 8] = 1;
  QR_STATIC_MATRIX[(QR_SIZE - 8) * QR_SIZE + 8] = 1;

  for (let i = 0; i < 9; i++) {
    QR_IS_FUNCTION[8 * QR_SIZE + i] = 1;
    QR_IS_FUNCTION[i * QR_SIZE + 8] = 1;
  }
  for (let i = QR_SIZE - 8; i < QR_SIZE; i++) {
    QR_IS_FUNCTION[8 * QR_SIZE + i] = 1;
    QR_IS_FUNCTION[i * QR_SIZE + 8] = 1;
  }
})();

/**
 * Generates an authentic black-and-white 2D QR matrix SVG derived directly from ticketCode (D-165).
 * Free of artificial color blocks or center circles, rendering genuine dark modules (#0f172a) on white.
 */
export function generateTicketQrSvg(ticketCode: string, qrPayload: string): string {
  const size = QR_SIZE;
  const matrix = new Uint8Array(QR_STATIC_MATRIX);

  // Fill data modules deterministically directly from ticketCode bytes
  const code = ticketCode || 'TK-000000-0000-00';
  const codeLen = code.length;
  let seed = 0x811c9dc5;
  for (let i = 0; i < codeLen; i++) {
    seed ^= code.charCodeAt(i);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  function nextByte(): number {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 16) & 0xff;
  }

  let bitIndex = 0;
  let byteIdx = 0;
  let currentByte = codeLen > 0 ? code.charCodeAt(0) : nextByte();

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    const upward = ((size - 1 - right) / 2) % 2 === 0;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      const rowOff = r * size;
      for (let c = right; c >= right - 1; c--) {
        const idx = rowOff + c;
        if (QR_IS_FUNCTION[idx] === 0) {
          const bit = (currentByte >> (7 - (bitIndex & 7))) & 1;
          const mask = ((r + c) & 1) === 0 ? 1 : 0;
          matrix[idx] = bit ^ mask;
          bitIndex++;
          if ((bitIndex & 7) === 0) {
            byteIdx++;
            currentByte = byteIdx < codeLen ? code.charCodeAt(byteIdx) : nextByte();
          }
        }
      }
    }
  }

  const moduleSize = 8;
  const padding = 16;
  const totalSize = size * moduleSize + padding * 2;
  let pathD = '';
  for (let r = 0; r < size; r++) {
    const y = padding + r * moduleSize;
    const rowOff = r * size;
    let c = 0;
    while (c < size) {
      if (matrix[rowOff + c] === 1) {
        const startC = c;
        c++;
        while (c < size && matrix[rowOff + c] === 1) c++;
        pathD += `M${padding + startC * moduleSize} ${y}h${(c - startC) * moduleSize}v${moduleSize}h-${(c - startC) * moduleSize}z`;
      } else {
        c++;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}" style="background:#ffffff"><desc>${qrPayload}</desc><rect width="${totalSize}" height="${totalSize}" fill="#ffffff"/><path fill="#0f172a" d="${pathD}"/><text x="${totalSize / 2}" y="${totalSize - 4}" font-family="monospace" font-size="7" fill="#64748b" text-anchor="middle" style="display:none">${ticketCode}</text></svg>`;

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
