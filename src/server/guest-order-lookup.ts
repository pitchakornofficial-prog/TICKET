import type { Pool } from 'pg';
import {
  ensureGuestOtpSchema,
  getVerifiedGuestSession,
  requestGuestOtp,
  verifyGuestOtp,
  type GuestBuyerDetails,
} from './guest-otp.ts';
import { ensureReservationSchema, type OrderItemDetail } from './reservation.ts';
import { ensureTicketSchema, getOrderTickets, type TicketDetail } from './tickets.ts';
import {
  ensureTicketDeliverySchema,
  getOrderEmailDelivery,
  type TicketEmailDeliveryRecord,
} from './ticket-delivery.ts';

export interface GuestOrderSummary {
  id: string;
  eventId: string;
  eventTitle: string;
  location: string;
  posterUrl: string | null;
  sessionId: string;
  sessionStartTime: string;
  sessionEndTime: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  status: 'reserved' | 'paid' | 'expired' | 'cancelled' | 'payment_exception';
  subtotal: number;
  customerFee: number;
  total: number;
  customerFeeMode: string;
  customerFeeRate: number;
  reservedAt: string;
  expiresAt: string;
  createdAt: string;
  items: OrderItemDetail[];
  tickets: TicketDetail[];
  emailDelivery: TicketEmailDeliveryRecord | null;
}

export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

/**
 * Searches orders table for a matching email and phone pair (AC-62).
 * Both email AND phone must match an existing order.
 */
export async function findMatchingOrderByContact(
  pool: Pool,
  email: string,
  phone: string,
  orderId?: string,
): Promise<{ id: string; buyerName: string; buyerEmail: string; buyerPhone: string } | null> {
  await ensureReservationSchema(pool);
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = cleanPhoneNumber(phone);

  if (!cleanEmail || !cleanPhone) {
    return null;
  }

  if (orderId?.trim()) {
    const res = await pool.query(
      `SELECT id, "buyerName", "buyerEmail", "buyerPhone"
       FROM orders
       WHERE id = $1
         AND LOWER("buyerEmail") = $2
         AND REPLACE(REPLACE("buyerPhone", '-', ''), ' ', '') = $3
       LIMIT 1`,
      [orderId.trim(), cleanEmail, cleanPhone],
    );
    if (res.rowCount === 0) return null;
    return res.rows[0];
  }

  const res = await pool.query(
    `SELECT id, "buyerName", "buyerEmail", "buyerPhone"
     FROM orders
     WHERE LOWER("buyerEmail") = $1
       AND REPLACE(REPLACE("buyerPhone", '-', ''), ' ', '') = $2
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [cleanEmail, cleanPhone],
  );

  if (res.rowCount === 0) return null;
  return res.rows[0];
}

/**
 * Requests OTP for looking up purchased tickets (AC-62, AC-63).
 * Requires both email and phone to match an existing order.
 */
export async function requestOrderLookupOtp(
  pool: Pool,
  input: {
    email: string;
    phone: string;
    orderId?: string;
    now?: Date;
  },
): Promise<{
  success: boolean;
  requestId?: string;
  cooldownSeconds?: number;
  expiresInSeconds?: number;
  error?: string;
  code?: 'NOT_FOUND' | 'INVALID_INPUT' | 'COOLDOWN' | 'RATE_LIMITED' | 'BLOCKED';
}> {
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();

  if (!email || !phone) {
    return {
      success: false,
      error: 'กรุณากรอกทั้งอีเมลและเบอร์โทรศัพท์ที่ใช้สั่งซื้อ',
      code: 'INVALID_INPUT',
    };
  }

  // AC-62: verify matching email and phone in orders before issuing OTP
  const matchingOrder = await findMatchingOrderByContact(pool, email, phone, input.orderId);
  if (!matchingOrder) {
    return {
      success: false,
      error: 'ไม่พบรายการคำสั่งซื้อที่ตรงกับอีเมลและเบอร์โทรศัพท์ที่ระบุ กรุณาตรวจสอบข้อมูลอีกครั้ง',
      code: 'NOT_FOUND',
    };
  }

  const buyer: GuestBuyerDetails = {
    name: matchingOrder.buyerName,
    email,
    phone: cleanPhoneNumber(phone),
  };

  const otpResult = await requestGuestOtp(pool, {
    buyer,
    purpose: 'order_lookup',
    now: input.now,
  });

  if (!otpResult.success) {
    return {
      success: false,
      error: otpResult.error,
      code: otpResult.code as 'COOLDOWN' | 'RATE_LIMITED' | 'BLOCKED',
      cooldownSeconds: otpResult.cooldownSeconds,
    };
  }

  return {
    success: true,
    requestId: otpResult.requestId,
    cooldownSeconds: otpResult.cooldownSeconds,
    expiresInSeconds: otpResult.expiresInSeconds,
  };
}

/**
 * Verifies OTP code for order lookup purpose (AC-57, AC-62).
 */
export async function verifyOrderLookupOtp(
  pool: Pool,
  input: {
    email: string;
    phone: string;
    code: string;
    requestId: string;
    now?: Date;
  },
): Promise<{
  success: boolean;
  verifiedToken?: string;
  error?: string;
  code?: 'INVALID_CODE' | 'EXPIRED' | 'REPLAY' | 'BLOCKED' | 'NOT_FOUND';
}> {
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();

  const matchingOrder = await findMatchingOrderByContact(pool, email, phone);
  const buyerName = matchingOrder?.buyerName || 'ผู้ซื้อ';

  const buyer: GuestBuyerDetails = {
    name: buyerName,
    email,
    phone: cleanPhoneNumber(phone),
  };

  const verifyResult = await verifyGuestOtp(pool, {
    email,
    code: input.code,
    requestId: input.requestId,
    purpose: 'order_lookup',
    buyer,
    now: input.now,
  });

  if (!verifyResult.success) {
    return {
      success: false,
      error: verifyResult.error,
      code: verifyResult.code,
    };
  }

  return {
    success: true,
    verifiedToken: verifyResult.verifiedToken,
  };
}

/**
 * Lists all orders belonging to the verified guest session (AC-21, AC-22, AC-62, AC-75).
 */
export async function lookupGuestOrders(
  pool: Pool,
  input: {
    verifiedToken: string;
    now?: Date;
  },
): Promise<{
  success: boolean;
  orders?: GuestOrderSummary[];
  buyer?: { email: string; phone: string; name: string };
  error?: string;
  code?: 'UNAUTHORIZED';
}> {
  await ensureReservationSchema(pool);
  await ensureTicketSchema(pool);
  await ensureTicketDeliverySchema(pool);
  await ensureGuestOtpSchema(pool);

  const session = await getVerifiedGuestSession(pool, input.verifiedToken, input.now);
  if (!session) {
    return {
      success: false,
      error: 'กรุณายืนยันตัวตนผ่าน OTP หรือเซสชันหมดอายุแล้ว',
      code: 'UNAUTHORIZED',
    };
  }

  const cleanEmail = session.email.toLowerCase();
  const cleanPhone = cleanPhoneNumber(session.phone);

  const ordersRes = await pool.query(
    `SELECT o.id, o."eventId", o."sessionId", o."buyerName", o."buyerEmail", o."buyerPhone",
            o.status, o.subtotal, o."customerFee", o.total, o."customerFeeMode", o."customerFeeRate",
            o."reservedAt", o."expiresAt", o."createdAt",
            e.title as "eventTitle", e.location, e."posterUrl",
            es."startTime" as "sessionStartTime", es."endTime" as "sessionEndTime"
     FROM orders o
     JOIN events e ON o."eventId" = e.id
     JOIN event_sessions es ON o."sessionId" = es.id
     WHERE LOWER(o."buyerEmail") = $1
       AND REPLACE(REPLACE(o."buyerPhone", '-', ''), ' ', '') = $2
     ORDER BY o."createdAt" DESC`,
    [cleanEmail, cleanPhone],
  );

  const orders: GuestOrderSummary[] = [];

  for (const row of ordersRes.rows) {
    // Get items
    const itemsRes = await pool.query(
      `SELECT oi.id, oi."ticketTypeId", oi.quantity, oi."unitPrice", oi.subtotal,
              tt.name as "ticketTypeName"
       FROM order_items oi
       JOIN ticket_types tt ON oi."ticketTypeId" = tt.id
       WHERE oi."orderId" = $1`,
      [row.id],
    );

    const items: OrderItemDetail[] = itemsRes.rows.map(i => ({
      id: i.id,
      ticketTypeId: i.ticketTypeId,
      ticketTypeName: i.ticketTypeName,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      subtotal: Number(i.subtotal),
    }));

    // Get issued tickets if paid (AC-75: original tickets and QR codes preserved)
    const tickets = row.status === 'paid' ? await getOrderTickets(pool, row.id) : [];

    // Get email delivery record
    const emailDelivery = await getOrderEmailDelivery(pool, row.id);

    orders.push({
      id: row.id,
      eventId: row.eventId,
      eventTitle: row.eventTitle,
      location: row.location,
      posterUrl: row.posterUrl,
      sessionId: row.sessionId,
      sessionStartTime: new Date(row.sessionStartTime).toISOString(),
      sessionEndTime: new Date(row.sessionEndTime).toISOString(),
      buyerName: row.buyerName,
      buyerEmail: row.buyerEmail,
      buyerPhone: row.buyerPhone,
      status: row.status,
      subtotal: Number(row.subtotal),
      customerFee: Number(row.customerFee),
      total: Number(row.total),
      customerFeeMode: row.customerFeeMode,
      customerFeeRate: Number(row.customerFeeRate),
      reservedAt: new Date(row.reservedAt).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
      createdAt: new Date(row.createdAt).toISOString(),
      items,
      tickets,
      emailDelivery,
    });
  }

  return {
    success: true,
    orders,
    buyer: {
      email: session.email,
      phone: session.phone,
      name: session.name,
    },
  };
}

/**
 * Gets a specific order detail under verified guest session.
 * Rejects with 403 Forbidden if order belongs to a different email or phone (AC-22, AC-62).
 */
export async function getGuestOrderDetail(
  pool: Pool,
  input: {
    verifiedToken: string;
    orderId: string;
    now?: Date;
  },
): Promise<{
  success: boolean;
  order?: GuestOrderSummary;
  error?: string;
  code?: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND';
}> {
  await ensureReservationSchema(pool);
  await ensureTicketSchema(pool);
  await ensureTicketDeliverySchema(pool);
  await ensureGuestOtpSchema(pool);

  const session = await getVerifiedGuestSession(pool, input.verifiedToken, input.now);
  if (!session) {
    return {
      success: false,
      error: 'กรุณายืนยันตัวตนผ่าน OTP หรือเซสชันหมดอายุแล้ว',
      code: 'UNAUTHORIZED',
    };
  }

  const orderRes = await pool.query(
    `SELECT o.id, o."eventId", o."sessionId", o."buyerName", o."buyerEmail", o."buyerPhone",
            o.status, o.subtotal, o."customerFee", o.total, o."customerFeeMode", o."customerFeeRate",
            o."reservedAt", o."expiresAt", o."createdAt",
            e.title as "eventTitle", e.location, e."posterUrl",
            es."startTime" as "sessionStartTime", es."endTime" as "sessionEndTime"
     FROM orders o
     JOIN events e ON o."eventId" = e.id
     JOIN event_sessions es ON o."sessionId" = es.id
     WHERE o.id = $1`,
    [input.orderId],
  );

  if (orderRes.rowCount === 0) {
    return {
      success: false,
      error: 'ไม่พบรายการคำสั่งซื้อ',
      code: 'NOT_FOUND',
    };
  }

  const row = orderRes.rows[0];

  // AC-22: Tampering and cross-buyer protection
  const sessionEmail = session.email.trim().toLowerCase();
  const orderEmail = row.buyerEmail.trim().toLowerCase();
  const sessionPhone = cleanPhoneNumber(session.phone);
  const orderPhone = cleanPhoneNumber(row.buyerPhone);

  if (sessionEmail !== orderEmail || sessionPhone !== orderPhone) {
    return {
      success: false,
      error: 'ไม่มีสิทธิ์เข้าถึงคำสั่งซื้อนี้',
      code: 'FORBIDDEN',
    };
  }

  const itemsRes = await pool.query(
    `SELECT oi.id, oi."ticketTypeId", oi.quantity, oi."unitPrice", oi.subtotal,
            tt.name as "ticketTypeName"
     FROM order_items oi
     JOIN ticket_types tt ON oi."ticketTypeId" = tt.id
     WHERE oi."orderId" = $1`,
    [row.id],
  );

  const items: OrderItemDetail[] = itemsRes.rows.map(i => ({
    id: i.id,
    ticketTypeId: i.ticketTypeId,
    ticketTypeName: i.ticketTypeName,
    quantity: Number(i.quantity),
    unitPrice: Number(i.unitPrice),
    subtotal: Number(i.subtotal),
  }));

  const tickets = row.status === 'paid' ? await getOrderTickets(pool, row.id) : [];
  const emailDelivery = await getOrderEmailDelivery(pool, row.id);

  return {
    success: true,
    order: {
      id: row.id,
      eventId: row.eventId,
      eventTitle: row.eventTitle,
      location: row.location,
      posterUrl: row.posterUrl,
      sessionId: row.sessionId,
      sessionStartTime: new Date(row.sessionStartTime).toISOString(),
      sessionEndTime: new Date(row.sessionEndTime).toISOString(),
      buyerName: row.buyerName,
      buyerEmail: row.buyerEmail,
      buyerPhone: row.buyerPhone,
      status: row.status,
      subtotal: Number(row.subtotal),
      customerFee: Number(row.customerFee),
      total: Number(row.total),
      customerFeeMode: row.customerFeeMode,
      customerFeeRate: Number(row.customerFeeRate),
      reservedAt: new Date(row.reservedAt).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
      createdAt: new Date(row.createdAt).toISOString(),
      items,
      tickets,
      emailDelivery,
    },
  };
}
