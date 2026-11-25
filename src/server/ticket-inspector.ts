import type { Pool } from 'pg';
import type { Actor } from '@/lib/back-office-access';

export interface InspectedTicketDetails {
  id: string;
  ticketCode: string;
  qrPayload: string;
  status: 'valid' | 'refunded' | 'cancelled';
  admissionStatus: 'inside' | 'outside';
  price: number;
  createdAt: string;
  updatedAt: string;

  // Event
  event: {
    id: string;
    title: string;
    location: string;
    googleMapsUrl: string | null;
    posterUrl: string | null;
    status: string;
    organizerId: string;
    organizerName: string;
    organizerEmail: string;
    isAuthorizedEvent: boolean;
  };

  // Session
  session: {
    id: string;
    startTime: string;
    endTime: string;
    admissionStartTime: string | null;
    admissionEndTime: string | null;
    status: string;
    isAdmissionOpen: boolean;
    isSessionStarted: boolean;
    isSessionEnded: boolean;
  };

  // Zone / Ticket Type
  zone: {
    id: string;
    name: string;
    price: number;
    quota: number;
    isStudentPrivilege?: boolean;
    studentPrice?: number | null;
  };

  // Order & Attendee
  order: {
    id: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string | null;
    status: string;
    paidAt: string | null;
    paymentMethod: string | null;
    createdAt: string;
    totalTicketsInOrder: number;
    isDirectTicket: boolean;
    directTicketInfo?: {
      referenceNote: string | null;
      priceDisplayMode: string | null;
      issuedByName: string | null;
    } | null;
  };

  // Admission Logs
  admissionLogs: {
    id: string;
    action: 'entry' | 'exit';
    status: 'success' | 'rejected';
    reason: string | null;
    scannerName: string;
    deviceMode: string;
    createdAt: string;
  }[];
}

export interface TicketInspectionResult {
  found: boolean;
  rawInput: string;
  message?: string;
  ticket?: InspectedTicketDetails;
}

export interface SampleTicketOption {
  ticketCode: string;
  qrPayload: string;
  eventTitle: string;
  ticketTypeName: string;
  buyerName: string;
  status: string;
  admissionStatus: string;
}

export async function inspectTicketPayload(
  pool: Pool,
  actor: Actor,
  input: { qrPayloadOrCode: string },
): Promise<TicketInspectionResult> {
  const cleanInput = (input.qrPayloadOrCode || '').trim();
  if (!cleanInput) {
    return {
      found: false,
      rawInput: '',
      message: 'กรุณาระบุรหัส QR Code หรือรหัสบัตรที่ต้องการตรวจสอบ',
    };
  }

  // 1. Search ticket by qrPayload, ticketCode, or orderId
  const tRes = await pool.query<{
    ticketId: string;
    ticketCode: string;
    qrPayload: string;
    ticketPrice: string | number | null;
    ticketStatus: string;
    admissionStatus: string;
    ticketCreatedAt: Date | string;
    ticketUpdatedAt: Date | string;
    eventId: string;
    eventTitle: string;
    eventLocation: string;
    googleMapsUrl: string | null;
    posterUrl: string | null;
    eventStatus: string;
    organizerId: string;
    organizerName: string | null;
    organizerEmail: string | null;
    sessionId: string;
    sessionStartTime: Date | string;
    sessionEndTime: Date | string;
    admissionStartTime: Date | string | null;
    admissionEndTime: Date | string | null;
    sessionStatus: string;
    ticketTypeId: string;
    ticketTypeName: string;
    zonePrice: string | number;
    zoneQuota: number;
    orderId: string | null;
    buyerName: string | null;
    buyerEmail: string | null;
    buyerPhone: string | null;
    orderStatus: string | null;
    orderPaidAt: Date | string | null;
    orderPaymentMethod: string | null;
    orderCreatedAt: Date | string | null;
    isDirectTicket: boolean | null;
    directReferenceNote?: string | null;
    directPriceDisplayMode?: string | null;
    directIssuedByName?: string | null;
    totalTicketsInOrder: number | null;
  }>(
    `SELECT 
       t.id AS "ticketId",
       t."ticketCode",
       t."qrPayload",
       t.price AS "ticketPrice",
       t.status AS "ticketStatus",
       t."admissionStatus",
       t."createdAt" AS "ticketCreatedAt",
       t."updatedAt" AS "ticketUpdatedAt",
       -- Event
       e.id AS "eventId",
       e.title AS "eventTitle",
       e.location AS "eventLocation",
       e."googleMapsUrl",
       e."posterUrl",
       e.status AS "eventStatus",
       e."organizerId",
       u.name AS "organizerName",
       u.email AS "organizerEmail",
       -- Session
       s.id AS "sessionId",
       s."startTime" AS "sessionStartTime",
       s."endTime" AS "sessionEndTime",
       s."admissionStartTime",
       s."admissionEndTime",
       s.status AS "sessionStatus",
       -- Zone / Ticket Type
       tt.id AS "ticketTypeId",
       tt.name AS "ticketTypeName",
       tt.price AS "zonePrice",
       tt.quota AS "zoneQuota",
       -- Order
       o.id AS "orderId",
       o."buyerName",
       o."buyerEmail",
       o."buyerPhone",
       o.status AS "orderStatus",
       CASE WHEN o.status = 'paid' THEN o."updatedAt" ELSE NULL END AS "orderPaidAt",
       CASE WHEN o."orderSource" = 'direct_issue' THEN 'direct_quota' ELSE 'promptpay' END AS "orderPaymentMethod",
       o."createdAt" AS "orderCreatedAt",
       (o."orderSource" = 'direct_issue') AS "isDirectTicket",
       o."referenceNote" AS "directReferenceNote",
       o."priceDisplayMode" AS "directPriceDisplayMode",
       (SELECT name FROM auth_user WHERE id = o."issuedByUserId") AS "directIssuedByName",
       (SELECT COUNT(*)::int FROM tickets ot WHERE ot."orderId" = o.id) AS "totalTicketsInOrder"
     FROM tickets t
     JOIN ticket_types tt ON tt.id = t."ticketTypeId"
     JOIN event_sessions s ON s.id = t."sessionId"
     JOIN events e ON e.id = t."eventId"
     LEFT JOIN auth_user u ON u.id = e."organizerId"
     LEFT JOIN orders o ON o.id = t."orderId"
     WHERE (
       t."qrPayload" = $1
       OR LOWER(t."qrPayload") = LOWER($1)
       OR t."ticketCode" = $1
       OR UPPER(t."ticketCode") = UPPER($1)
       OR t."orderId" = $1
       OR UPPER(t."orderId") = UPPER($1)
     )
     LIMIT 1`,
    [cleanInput],
  );

  if (tRes.rowCount === 0) {
    return {
      found: false,
      rawInput: cleanInput,
      message: 'ไม่พบบัตรในระบบ กรุณาตรวจสอบ QR Code หรือรหัสบัตรว่าถูกต้องหรือไม่',
    };
  }

  const row = tRes.rows[0];

  // Check authorization context
  let isAuthorizedEvent = true;
  if (actor.role === 'organizer') {
    isAuthorizedEvent = row.organizerId === actor.id;
  } else if (actor.role === 'scanner') {
    const scannerRes = await pool.query(
      `SELECT 1 FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2`,
      [row.eventId, actor.id],
    );
    isAuthorizedEvent = (scannerRes.rowCount ?? 0) > 0;
  }

  // Fetch admission logs for this ticket
  const logsRes = await pool.query<{
    id: string;
    action: 'entry' | 'exit';
    status: 'success' | 'rejected';
    reason: string | null;
    scannerName: string;
    deviceMode: string;
    createdAt: Date | string;
  }>(
    `SELECT id, action, status, reason, "scannerName", "deviceMode", "createdAt"
     FROM ticket_admission_logs
     WHERE "ticketId" = $1
     ORDER BY "createdAt" DESC
     LIMIT 10`,
    [row.ticketId],
  );

  // Check direct ticket metadata if applicable
  let directTicketInfo = null;
  if (row.isDirectTicket && row.orderId) {
    directTicketInfo = {
      referenceNote: row.directReferenceNote || null,
      priceDisplayMode: row.directPriceDisplayMode || null,
      issuedByName: row.directIssuedByName || null,
    };
  }

  // Calculate timing & admission window
  const now = new Date();
  const sessionStartTime = new Date(row.sessionStartTime);
  const sessionEndTime = new Date(row.sessionEndTime);
  const admStart = row.admissionStartTime ? new Date(row.admissionStartTime) : null;
  const admEnd = row.admissionEndTime ? new Date(row.admissionEndTime) : null;

  let isAdmissionOpen = false;
  if (admStart && admEnd) {
    isAdmissionOpen = now >= admStart && now <= admEnd;
  } else {
    // Default open window: 3 hours before start time until end time
    const defStart = new Date(sessionStartTime.getTime() - 3 * 60 * 60 * 1000);
    isAdmissionOpen = now >= defStart && now <= sessionEndTime;
  }

  const isSessionStarted = now >= sessionStartTime && now <= sessionEndTime;
  const isSessionEnded = now > sessionEndTime;

  const ticket: InspectedTicketDetails = {
    id: row.ticketId,
    ticketCode: row.ticketCode,
    qrPayload: row.qrPayload,
    status: row.ticketStatus as 'valid' | 'refunded' | 'cancelled',
    admissionStatus: row.admissionStatus as 'inside' | 'outside',
    price: Number(row.ticketPrice ?? row.zonePrice ?? 0),
    createdAt: row.ticketCreatedAt instanceof Date ? row.ticketCreatedAt.toISOString() : String(row.ticketCreatedAt),
    updatedAt: row.ticketUpdatedAt instanceof Date ? row.ticketUpdatedAt.toISOString() : String(row.ticketUpdatedAt),

    event: {
      id: row.eventId,
      title: row.eventTitle,
      location: row.eventLocation,
      googleMapsUrl: row.googleMapsUrl,
      posterUrl: row.posterUrl,
      status: row.eventStatus,
      organizerId: row.organizerId,
      organizerName: row.organizerName || 'ผู้จัดงาน',
      organizerEmail: row.organizerEmail || '',
      isAuthorizedEvent,
    },

    session: {
      id: row.sessionId,
      startTime: row.sessionStartTime instanceof Date ? row.sessionStartTime.toISOString() : String(row.sessionStartTime),
      endTime: row.sessionEndTime instanceof Date ? row.sessionEndTime.toISOString() : String(row.sessionEndTime),
      admissionStartTime: row.admissionStartTime instanceof Date ? row.admissionStartTime.toISOString() : (row.admissionStartTime ? String(row.admissionStartTime) : null),
      admissionEndTime: row.admissionEndTime instanceof Date ? row.admissionEndTime.toISOString() : (row.admissionEndTime ? String(row.admissionEndTime) : null),
      status: row.sessionStatus,
      isAdmissionOpen,
      isSessionStarted,
      isSessionEnded,
    },

    zone: {
      id: row.ticketTypeId,
      name: row.ticketTypeName,
      price: Number(row.zonePrice),
      quota: row.zoneQuota,
    },

    order: {
      id: row.orderId || 'N/A',
      buyerName: row.buyerName || 'ไม่ระบุชื่อ',
      buyerEmail: row.buyerEmail || '-',
      buyerPhone: row.buyerPhone || null,
      status: row.orderStatus || 'paid',
      paidAt: row.orderPaidAt instanceof Date ? row.orderPaidAt.toISOString() : (row.orderPaidAt ? String(row.orderPaidAt) : null),
      paymentMethod: row.orderPaymentMethod || 'promptpay_qr',
      createdAt: row.orderCreatedAt instanceof Date ? row.orderCreatedAt.toISOString() : (row.orderCreatedAt ? String(row.orderCreatedAt) : ''),
      totalTicketsInOrder: row.totalTicketsInOrder || 1,
      isDirectTicket: Boolean(row.isDirectTicket),
      directTicketInfo,
    },

    admissionLogs: logsRes.rows.map(log => ({
      id: log.id,
      action: log.action,
      status: log.status,
      reason: log.reason,
      scannerName: log.scannerName,
      deviceMode: log.deviceMode,
      createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
    })),
  };

  return {
    found: true,
    rawInput: cleanInput,
    ticket,
  };
}

export async function getRecentSampleTickets(pool: Pool, actor: Actor): Promise<SampleTicketOption[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (actor.role === 'organizer') {
    whereClause = 'WHERE e."organizerId" = $1';
    params.push(actor.id);
  } else if (actor.role === 'scanner') {
    whereClause = `WHERE e.id IN (SELECT "eventId" FROM event_scanners WHERE "scannerId" = $1)`;
    params.push(actor.id);
  }

  const query = `
    SELECT 
      t."ticketCode",
      t."qrPayload",
      t.status,
      t."admissionStatus",
      e.title AS "eventTitle",
      tt.name AS "ticketTypeName",
      COALESCE(o."buyerName", 'ลูกค้าทั่วไป') AS "buyerName"
    FROM tickets t
    JOIN events e ON e.id = t."eventId"
    JOIN ticket_types tt ON tt.id = t."ticketTypeId"
    LEFT JOIN orders o ON o.id = t."orderId"
    ${whereClause}
    ORDER BY t."createdAt" DESC
    LIMIT 5
  `;

  const res = await pool.query<{
    ticketCode: string;
    qrPayload: string;
    status: string;
    admissionStatus: string;
    eventTitle: string;
    ticketTypeName: string;
    buyerName: string;
  }>(query, params);

  return res.rows.map(r => ({
    ticketCode: r.ticketCode,
    qrPayload: r.qrPayload,
    eventTitle: r.eventTitle,
    ticketTypeName: r.ticketTypeName,
    buyerName: r.buyerName,
    status: r.status,
    admissionStatus: r.admissionStatus,
  }));
}
