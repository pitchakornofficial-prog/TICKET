import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ensureTicketSchema } from './tickets.ts';
import { ensureAdmissionSchema } from './admission.ts';
import { getVerifiedGuestSession, ensureGuestOtpSchema } from './guest-otp.ts';
import { cleanPhoneNumber } from './guest-order-lookup.ts';
import { storage } from './storage.ts';

export interface RefundRequestInput {
  verifiedToken: string;
  orderId: string;
  ticketIds: string[];
  reason: string;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  now?: Date;
}

export interface TicketRefundEligibility {
  ticketId: string;
  ticketCode: string;
  ticketTypeName: string;
  ticketPrice: number;
  eligible: boolean;
  reason?: string;
  admissionStatus: string;
  hasAdmitted: boolean;
  activeRefundRequestId?: string;
}

export interface OrderRefundEligibilitySummary {
  orderId: string;
  sessionStartTime: string;
  cutoffTime: string; // 168 hours before session
  isWithinNormalCutoff: boolean;
  isWithinSpecialWindow: boolean;
  specialRefundWindowStart?: string | null;
  specialRefundWindowEnd?: string | null;
  tickets: TicketRefundEligibility[];
}

export interface RefundRequestItem {
  id: string;
  ticketId: string;
  ticketCode: string;
  ticketPrice: number;
}

export interface RefundRequestSummary {
  id: string;
  orderId: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerName: string;
  requestedAmount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  rejectionReason?: string | null;
  transferredAt?: string | null;
  transferredAmount?: number | null;
  transferFailureReason?: string | null;
  items: RefundRequestItem[];
}

export async function ensureRefundSchema(pool: Pool): Promise<void> {
  const check = await pool.query(`SELECT to_regclass('refund_requests') AS tbl`);
  if (check.rows[0]?.tbl) return;

  await ensureTicketSchema(pool);
  await ensureAdmissionSchema(pool);
  await ensureGuestOtpSchema(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refund_requests (
      id TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      "buyerEmail" TEXT NOT NULL,
      "buyerPhone" TEXT NOT NULL,
      "buyerName" TEXT NOT NULL,
      "requestedAmount" NUMERIC(12, 2) NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      "bankName" TEXT,
      "bankAccountNo" TEXT,
      "bankAccountName" TEXT,
      "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "reviewedAt" TIMESTAMPTZ,
      "reviewedByUserId" TEXT REFERENCES auth_user(id),
      "reviewedByName" TEXT,
      "rejectionReason" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON refund_requests("orderId");
    CREATE INDEX IF NOT EXISTS idx_refund_requests_email ON refund_requests("buyerEmail");
    CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);

    CREATE TABLE IF NOT EXISTS refund_request_items (
      id TEXT PRIMARY KEY,
      "refundRequestId" TEXT NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
      "ticketId" TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      "ticketCode" TEXT NOT NULL,
      "ticketPrice" NUMERIC(12, 2) NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_refund_items_request ON refund_request_items("refundRequestId");
    CREATE INDEX IF NOT EXISTS idx_refund_items_ticket ON refund_request_items("ticketId");

    CREATE TABLE IF NOT EXISTS refund_liabilities (
      id TEXT PRIMARY KEY,
      "refundRequestId" TEXT NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      "approvedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "settledAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_liabilities_request ON refund_liabilities("refundRequestId");
    CREATE INDEX IF NOT EXISTS idx_refund_liabilities_event ON refund_liabilities("eventId");

    ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS "transferredAt" TIMESTAMPTZ;
    ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS "transferredAmount" NUMERIC(12, 2);
    ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS "transferProofKey" TEXT;
    ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS "transferProofUrl" TEXT;
    ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS "transferNote" TEXT;
    ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS "transferFailureReason" TEXT;
    ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS "transferFailedAt" TIMESTAMPTZ;
  `);
}

/**
 * Normal refund cutoff is 168 hours before session start time (inclusive).
 * now <= sessionStartTime - 168h
 */
export function calculateRefundCutoff(sessionStartTime: Date): Date {
  return new Date(sessionStartTime.getTime() - 168 * 60 * 60 * 1000);
}

/**
 * Checks if a given time is within the normal 168h refund window.
 */
export function isWithinRefundWindow(sessionStartTime: Date, now = new Date()): boolean {
  const cutoff = calculateRefundCutoff(sessionStartTime);
  return now.getTime() <= cutoff.getTime();
}

/**
 * Checks if a given time is within the special refund window (AC-38).
 */
export function isWithinSpecialRefundWindow(
  windowStart?: Date | string | null,
  windowEnd?: Date | string | null,
  now = new Date(),
): boolean {
  if (!windowStart || !windowEnd) return false;
  const start = new Date(windowStart).getTime();
  const end = new Date(windowEnd).getTime();
  const current = now.getTime();
  return current >= start && current <= end;
}

/**
 * Check ticket eligibility for refund in an order.
 */
export async function getOrderRefundEligibility(
  pool: Pool,
  orderId: string,
  now = new Date(),
): Promise<OrderRefundEligibilitySummary> {
  await ensureRefundSchema(pool);

  const orderRes = await pool.query<{
    sessionId: string;
    sessionStartTime: Date;
    status: string;
    specialRefundWindowStart?: Date | null;
    specialRefundWindowEnd?: Date | null;
  }>(
    `SELECT o."sessionId", o.status, es."startTime" AS "sessionStartTime",
            es."specialRefundWindowStart", es."specialRefundWindowEnd"
     FROM orders o
     JOIN event_sessions es ON es.id = o."sessionId"
     WHERE o.id = $1`,
    [orderId],
  );

  if (orderRes.rowCount === 0) {
    throw new Error('ไม่พบคำสั่งซื้อ');
  }

  const order = orderRes.rows[0];
  const sessionStartTime = new Date(order.sessionStartTime);
  const cutoffTime = calculateRefundCutoff(sessionStartTime);
  const isWithinNormalCutoff = now.getTime() <= cutoffTime.getTime();
  const isWithinSpecialWindow = isWithinSpecialRefundWindow(
    order.specialRefundWindowStart,
    order.specialRefundWindowEnd,
    now,
  );
  const isEligibleWindow = isWithinNormalCutoff || isWithinSpecialWindow;

  // Retrieve all tickets of this order
  const tRes = await pool.query<{
    id: string;
    ticketCode: string;
    ticketTypeName: string;
    ticketPrice: number;
    status: string;
    admissionStatus: string;
  }>(
    `SELECT t.id, t."ticketCode", t.status, t."admissionStatus",
            tt.name AS "ticketTypeName", tt.price AS "ticketPrice"
     FROM tickets t
     JOIN ticket_types tt ON tt.id = t."ticketTypeId"
     WHERE t."orderId" = $1
     ORDER BY t."ticketCode" ASC`,
    [orderId],
  );

  // Retrieve any tickets with existing pending or approved refund requests
  const activeRefunds = await pool.query<{ ticketId: string; refundRequestId: string }>(
    `SELECT rri."ticketId", rri."refundRequestId"
     FROM refund_request_items rri
     JOIN refund_requests rr ON rr.id = rri."refundRequestId"
     WHERE rr."orderId" = $1 AND rr.status IN ('pending', 'approved')`,
    [orderId],
  );
  const activeRefundMap = new Map(activeRefunds.rows.map(r => [r.ticketId, r.refundRequestId]));

  // Retrieve tickets that have ever been admitted
  const admissions = await pool.query<{ ticketId: string }>(
    `SELECT DISTINCT "ticketId"
     FROM ticket_admission_logs
     WHERE "ticketId" = ANY($1) AND action = 'entry' AND status = 'success'`,
    [tRes.rows.map(r => r.id)],
  );
  const admittedSet = new Set(admissions.rows.map(r => r.ticketId));

  const tickets: TicketRefundEligibility[] = tRes.rows.map(t => {
    const hasAdmitted = admittedSet.has(t.id) || t.admissionStatus === 'inside';
    const activeRequestId = activeRefundMap.get(t.id);

    let eligible = true;
    let reason: string | undefined;

    if (order.status !== 'paid') {
      eligible = false;
      reason = 'คำสั่งซื้อยังไม่ชำระเงิน';
    } else if (t.status === 'cancelled') {
      eligible = false;
      reason = 'บัตรถูกยกเลิกแล้ว';
    } else if (t.status === 'refunded') {
      eligible = false;
      reason = 'บัตรได้รับการคืนเงินแล้ว';
    } else if (t.status !== 'valid') {
      eligible = false;
      reason = 'สถานะบัตรไม่ถูกต้อง';
    } else if (activeRequestId) {
      eligible = false;
      reason = 'บัตรนี้มีคำขอคืนเงินอยู่แล้ว (รอตรวจสอบ)';
    } else if (hasAdmitted) {
      eligible = false;
      reason = 'บัตรเคยสแกนเข้างานแล้ว ไม่สามารถขอคืนได้ (AC-32)';
    } else if (!isEligibleWindow) {
      eligible = false;
      reason = 'พ้นกำหนดเวลายื่นคำขอคืนเงิน (พ้นกำหนดปกติ 168 ชั่วโมง และไม่อยู่ในช่วงเวลาขอคืนพิเศษ) (AC-32, AC-38)';
    }

    return {
      ticketId: t.id,
      ticketCode: t.ticketCode,
      ticketTypeName: t.ticketTypeName,
      ticketPrice: Number(t.ticketPrice),
      eligible,
      reason,
      admissionStatus: t.admissionStatus,
      hasAdmitted,
      activeRefundRequestId: activeRequestId,
    };
  });

  return {
    orderId,
    sessionStartTime: sessionStartTime.toISOString(),
    cutoffTime: cutoffTime.toISOString(),
    isWithinNormalCutoff,
    isWithinSpecialWindow,
    specialRefundWindowStart: order.specialRefundWindowStart ? new Date(order.specialRefundWindowStart).toISOString() : null,
    specialRefundWindowEnd: order.specialRefundWindowEnd ? new Date(order.specialRefundWindowEnd).toISOString() : null,
    tickets,
  };
}

/**
 * Submit a refund request for selected tickets (AC-32, AC-33, AC-34, AC-21).
 * Calculates refund amount strictly as ticket face value (excluding customer service fees).
 * Status remains 'pending' without immediate revocation until approved (AC-34, TASK-022).
 */
export async function submitRefundRequest(
  pool: Pool,
  input: RefundRequestInput,
): Promise<{
  success: boolean;
  refundRequestId?: string;
  requestedAmount?: number;
  ticketCount?: number;
  status?: string;
  error?: string;
  code?: string;
}> {
  await ensureRefundSchema(pool);

  // 1. Validate verified guest session (AC-21)
  const session = await getVerifiedGuestSession(pool, input.verifiedToken, input.now);
  if (!session) {
    return {
      success: false,
      error: 'กรุณายืนยันตัวตนผ่าน OTP หรือเซสชันหมดอายุแล้ว (AC-21)',
      code: 'UNAUTHORIZED',
    };
  }

  if (!input.ticketIds || input.ticketIds.length === 0) {
    return {
      success: false,
      error: 'กรุณาเลือกบัตรที่ต้องการขอคืนเงินอย่างน้อย 1 ใบ (AC-34)',
      code: 'INVALID_INPUT',
    };
  }

  if (!input.reason?.trim()) {
    return {
      success: false,
      error: 'กรุณาระบุเหตุผลการขอคืนเงิน',
      code: 'INVALID_INPUT',
    };
  }

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Lock order and verify buyer identity
    const orderRes = await client.query<{
      id: string;
      status: string;
      buyerEmail: string;
      buyerPhone: string;
      buyerName: string;
      sessionId: string;
      sessionStartTime: Date;
      specialRefundWindowStart?: Date | null;
      specialRefundWindowEnd?: Date | null;
    }>(
      `SELECT o.id, o.status, o."buyerEmail", o."buyerPhone", o."buyerName",
              o."sessionId", es."startTime" AS "sessionStartTime",
              es."specialRefundWindowStart", es."specialRefundWindowEnd"
       FROM orders o
       JOIN event_sessions es ON es.id = o."sessionId"
       WHERE o.id = $1
       FOR UPDATE`,
      [input.orderId],
    );

    if (orderRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'ไม่พบรายการคำสั่งซื้อ', code: 'NOT_FOUND' };
    }

    const order = orderRes.rows[0];

    // AC-22: Cross-buyer tampering check
    const sessionEmail = session.email.trim().toLowerCase();
    const orderEmail = order.buyerEmail.trim().toLowerCase();
    const sessionPhone = cleanPhoneNumber(session.phone);
    const orderPhone = cleanPhoneNumber(order.buyerPhone);

    if (sessionEmail !== orderEmail || sessionPhone !== orderPhone) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'คุณไม่มีสิทธิ์ยื่นคำขอคืนเงินสำหรับคำสั่งซื้อนี้ (AC-22)',
        code: 'FORBIDDEN',
      };
    }

    if (order.status !== 'paid') {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'สามารถขอคืนเงินได้เฉพาะคำสั่งซื้อที่ชำระเงินสำเร็จแล้วเท่านั้น',
        code: 'INVALID_ORDER_STATUS',
      };
    }

    // 3. Cutoff check (AC-32, AC-38): 168 hours before session or within special refund window
    const currentTime = input.now || new Date();
    const sessionStartTime = new Date(order.sessionStartTime);
    const cutoffTime = calculateRefundCutoff(sessionStartTime);
    const isWithinNormalCutoff = currentTime.getTime() <= cutoffTime.getTime();
    const isWithinSpecialWindow = isWithinSpecialRefundWindow(
      order.specialRefundWindowStart,
      order.specialRefundWindowEnd,
      currentTime,
    );

    if (!isWithinNormalCutoff && !isWithinSpecialWindow) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error:
          'พ้นกำหนดเวลายื่นคำขอคืนเงิน (พ้นกำหนดปกติ 168 ชั่วโมง และไม่อยู่ในช่วงเวลาขอคืนพิเศษ) (AC-32, AC-38)',
        code: 'PAST_REFUND_CUTOFF',
      };
    }

    // 4. Lock selected tickets and check eligibility
    const ticketsRes = await client.query<{
      id: string;
      orderId: string;
      ticketCode: string;
      status: string;
      admissionStatus: string;
      ticketPrice: number;
    }>(
      `SELECT t.id, t."orderId", t."ticketCode", t.status, t."admissionStatus",
              tt.price AS "ticketPrice"
       FROM tickets t
       JOIN ticket_types tt ON tt.id = t."ticketTypeId"
       WHERE t.id = ANY($1)
       FOR UPDATE`,
      [input.ticketIds],
    );

    if (ticketsRes.rowCount !== input.ticketIds.length) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'มีบัตรบางใบที่ไม่พบในระบบหรือระบุรหัสบัตรไม่ถูกต้อง',
        code: 'TICKET_NOT_FOUND',
      };
    }

    // Verify all tickets belong to this order
    for (const t of ticketsRes.rows) {
      if (t.orderId !== order.id) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'บัตรบางใบไม่ได้เป็นของคำสั่งซื้อนี้',
          code: 'WRONG_ORDER_TICKET',
        };
      }

      if (t.status !== 'valid') {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `บัตร ${t.ticketCode} ไม่สามารถขอคืนได้เนื่องจากสถานะไม่ใช่ valid (${t.status})`,
          code: 'INVALID_TICKET_STATUS',
        };
      }
    }

    // Check admission history (AC-32: never admitted)
    const admRes = await client.query<{ ticketId: string }>(
      `SELECT DISTINCT "ticketId"
       FROM ticket_admission_logs
       WHERE "ticketId" = ANY($1) AND action = 'entry' AND status = 'success'`,
      [input.ticketIds],
    );

    if (admRes.rowCount && admRes.rowCount > 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'ไม่สามารถขอคืนเงินบัตรที่เคยสแกนเข้างานแล้วได้ (AC-32)',
        code: 'TICKET_ALREADY_ADMITTED',
      };
    }

    // Check existing active refund requests for these tickets
    const activeRefRes = await client.query<{ ticketCode: string }>(
      `SELECT rri."ticketCode"
       FROM refund_request_items rri
       JOIN refund_requests rr ON rr.id = rri."refundRequestId"
       WHERE rri."ticketId" = ANY($1) AND rr.status IN ('pending', 'approved')`,
      [input.ticketIds],
    );

    if (activeRefRes.rowCount && activeRefRes.rowCount > 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: `บัตร ${activeRefRes.rows[0].ticketCode} ได้ยื่นคำขอคืนเงินไว้แล้ว ไม่สามารถยื่นซ้ำได้`,
        code: 'DUPLICATE_REFUND_REQUEST',
      };
    }

    // 5. Calculate face value total (AC-33: excludes customer fee)
    const requestedAmount = ticketsRes.rows.reduce(
      (sum, t) => sum + Number(t.ticketPrice),
      0,
    );

    // 6. Create refund request
    const refundRequestId = `REF-${randomUUID().slice(0, 8).toUpperCase()}`;

    await client.query(
      `INSERT INTO refund_requests (
         id, "orderId", "buyerEmail", "buyerPhone", "buyerName",
         "requestedAmount", reason, status, "bankName", "bankAccountNo", "bankAccountName",
         "submittedAt", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, now(), now())`,
      [
        refundRequestId,
        order.id,
        order.buyerEmail,
        order.buyerPhone,
        order.buyerName,
        requestedAmount,
        input.reason.trim(),
        input.bankName?.trim() || null,
        input.bankAccountNo?.trim() || null,
        input.bankAccountName?.trim() || null,
        currentTime,
      ],
    );

    // Insert items
    for (const t of ticketsRes.rows) {
      await client.query(
        `INSERT INTO refund_request_items (
           id, "refundRequestId", "ticketId", "ticketCode", "ticketPrice", "createdAt"
         ) VALUES ($1, $2, $3, $4, $5, now())`,
        [randomUUID(), refundRequestId, t.id, t.ticketCode, Number(t.ticketPrice)],
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      refundRequestId,
      requestedAmount,
      ticketCount: ticketsRes.rows.length,
      status: 'pending',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieve all refund requests for an order.
 */
export async function getOrderRefundRequests(
  pool: Pool,
  orderId: string,
): Promise<RefundRequestSummary[]> {
  await ensureRefundSchema(pool);

  const reqRes = await pool.query<{
    id: string;
    orderId: string;
    buyerEmail: string;
    buyerPhone: string;
    buyerName: string;
    requestedAmount: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed';
    bankName: string | null;
    bankAccountNo: string | null;
    bankAccountName: string | null;
    submittedAt: Date;
    reviewedAt: Date | null;
    reviewedByName: string | null;
    rejectionReason: string | null;
    transferredAt: Date | null;
    transferredAmount: number | null;
    transferFailureReason: string | null;
  }>(
    `SELECT id, "orderId", "buyerEmail", "buyerPhone", "buyerName",
            "requestedAmount", reason, status, "bankName", "bankAccountNo", "bankAccountName",
            "submittedAt", "reviewedAt", "reviewedByName", "rejectionReason",
            "transferredAt", "transferredAmount", "transferFailureReason"
     FROM refund_requests
     WHERE "orderId" = $1
     ORDER BY "submittedAt" DESC`,
    [orderId],
  );

  const results: RefundRequestSummary[] = [];

  for (const r of reqRes.rows) {
    const itemRes = await pool.query<{
      id: string;
      ticketId: string;
      ticketCode: string;
      ticketPrice: number;
    }>(
      `SELECT id, "ticketId", "ticketCode", "ticketPrice"
       FROM refund_request_items
       WHERE "refundRequestId" = $1
       ORDER BY "ticketCode" ASC`,
      [r.id],
    );

    results.push({
      id: r.id,
      orderId: r.orderId,
      buyerEmail: r.buyerEmail,
      buyerPhone: r.buyerPhone,
      buyerName: r.buyerName,
      requestedAmount: Number(r.requestedAmount),
      reason: r.reason,
      status: r.status,
      bankName: r.bankName,
      bankAccountNo: r.bankAccountNo,
      bankAccountName: r.bankAccountName,
      submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : String(r.submittedAt),
      reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : r.reviewedAt ? String(r.reviewedAt) : null,
      reviewedByName: r.reviewedByName,
      rejectionReason: r.rejectionReason,
      transferredAt: r.transferredAt instanceof Date ? r.transferredAt.toISOString() : r.transferredAt ? String(r.transferredAt) : null,
      transferredAmount: r.transferredAmount !== null && r.transferredAmount !== undefined ? Number(r.transferredAmount) : null,
      transferFailureReason: r.transferFailureReason,
      items: itemRes.rows.map(item => ({
        id: item.id,
        ticketId: item.ticketId,
        ticketCode: item.ticketCode,
        ticketPrice: Number(item.ticketPrice),
      })),
    });
  }

  return results;
}

export interface ApproveRefundInput {
  refundRequestId: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerRole: string;
  now?: Date;
}

export interface ApproveRefundResult {
  success: boolean;
  refundRequestId: string;
  status: string;
  revokedTicketCount: number;
  liabilityAmount: number;
  quotaReturned: boolean;
  alreadyApproved?: boolean;
  error?: string;
  code?: string;
}

export interface RejectRefundInput {
  refundRequestId: string;
  rejectionReason: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerRole: string;
}

export interface OwnerRefundRequestItem {
  id: string;
  orderId: string;
  eventId: string;
  eventTitle: string;
  sessionId: string;
  sessionStatus: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerName: string;
  requestedAmount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  transferredAt: string | null;
  transferredAmount: number | null;
  transferProofKey: string | null;
  transferProofUrl: string | null;
  transferNote: string | null;
  transferFailureReason: string | null;
  transferFailedAt: string | null;
  liabilityStatus: 'unpaid' | 'settled' | null;
  items: RefundRequestItem[];
}

/**
 * Owner approves a refund request (AC-36, AC-88, AC-89, AC-90, AC-107, G-36).
 * Atomic transaction:
 * - Checks admission logs: if ticket was admitted, reject (AC-88)
 * - Revokes approved tickets: status = 'refunded' immediately (AC-36, AC-89)
 * - Creates refund liability record immediately (AC-36, G-36)
 * - Returns quota once if session is approved; do not return for sale if session is cancelled (AC-90)
 * - Idempotent on repeated calls (AC-90, AC-107)
 */
export async function approveRefundRequest(
  pool: Pool,
  input: ApproveRefundInput,
): Promise<ApproveRefundResult> {
  await ensureRefundSchema(pool);

  if (input.reviewerRole !== 'owner') {
    return {
      success: false,
      refundRequestId: input.refundRequestId,
      status: 'unauthorized',
      revokedTicketCount: 0,
      liabilityAmount: 0,
      quotaReturned: false,
      error: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์อนุมัติคำขอคืนเงิน',
      code: 'FORBIDDEN',
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock refund request
    const reqRes = await client.query<{
      id: string;
      orderId: string;
      status: string;
      requestedAmount: number;
    }>(
      `SELECT id, "orderId", status, "requestedAmount"
       FROM refund_requests
       WHERE id = $1
       FOR UPDATE`,
      [input.refundRequestId],
    );

    if (reqRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        refundRequestId: input.refundRequestId,
        status: 'not_found',
        revokedTicketCount: 0,
        liabilityAmount: 0,
        quotaReturned: false,
        error: 'ไม่พบคำขอคืนเงินที่ระบุ',
        code: 'NOT_FOUND',
      };
    }

    const request = reqRes.rows[0];

    // Idempotent check (AC-90, AC-107)
    if (request.status === 'approved') {
      const itemsRes = await client.query<{ ticketId: string }>(
        `SELECT "ticketId" FROM refund_request_items WHERE "refundRequestId" = $1`,
        [request.id],
      );
      await client.query('COMMIT');
      return {
        success: true,
        refundRequestId: request.id,
        status: 'approved',
        revokedTicketCount: itemsRes.rowCount || 0,
        liabilityAmount: Number(request.requestedAmount),
        quotaReturned: false,
        alreadyApproved: true,
      };
    }

    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return {
        success: false,
        refundRequestId: request.id,
        status: request.status,
        revokedTicketCount: 0,
        liabilityAmount: 0,
        quotaReturned: false,
        error: `ไม่สามารถอนุมัติได้เนื่องจากคำขออยู่ในสถานะ "${request.status}"`,
        code: 'INVALID_STATUS',
      };
    }

    // 2. Lock tickets in this refund request
    const ticketsRes = await client.query<{
      id: string;
      orderId: string;
      ticketCode: string;
      status: string;
      admissionStatus: string;
      ticketTypeId: string;
      eventId: string;
      sessionId: string;
      sessionStatus: string;
    }>(
      `SELECT t.id, t."orderId", t."ticketCode", t.status, t."admissionStatus",
              t."ticketTypeId", t."eventId", t."sessionId", es.status AS "sessionStatus"
       FROM refund_request_items rri
       JOIN tickets t ON t.id = rri."ticketId"
       JOIN event_sessions es ON es.id = t."sessionId"
       WHERE rri."refundRequestId" = $1
       FOR UPDATE OF t`,
      [request.id],
    );

    if (ticketsRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        refundRequestId: request.id,
        status: 'no_tickets',
        revokedTicketCount: 0,
        liabilityAmount: 0,
        quotaReturned: false,
        error: 'ไม่พบรายการบัตรในคำขอคืนเงินนี้',
        code: 'NO_TICKETS',
      };
    }

    const tickets = ticketsRes.rows;
    const ticketIds = tickets.map(t => t.id);

    // 3. Re-verify admission status (AC-88: cannot refund if ever admitted)
    const admCheck = await client.query<{ ticketId: string; ticketCode: string }>(
      `SELECT DISTINCT t.id AS "ticketId", t."ticketCode"
       FROM ticket_admission_logs tal
       JOIN tickets t ON t.id = tal."ticketId"
       WHERE tal."ticketId" = ANY($1) AND tal.action = 'entry' AND tal.status = 'success'`,
      [ticketIds],
    );

    if (admCheck.rowCount && admCheck.rowCount > 0) {
      await client.query('ROLLBACK');
      const admittedCode = admCheck.rows[0].ticketCode;
      return {
        success: false,
        refundRequestId: request.id,
        status: 'rejected_admitted',
        revokedTicketCount: 0,
        liabilityAmount: 0,
        quotaReturned: false,
        error: `บัตร ${admittedCode} มีประวัติการสแกนเข้างานแล้ว ไม่สามารถอนุมัติคืนเงินได้ (AC-88)`,
        code: 'TICKET_ALREADY_ADMITTED',
      };
    }

    // 4. Revoke tickets immediately (AC-36, AC-89)
    await client.query(
      `UPDATE tickets
       SET status = 'refunded', "updatedAt" = now()
       WHERE id = ANY($1)`,
      [ticketIds],
    );

    // 5. Record refund liability (AC-36, G-36)
    const liabilityId = `LIA-${randomUUID().slice(0, 8).toUpperCase()}`;
    const firstTicket = tickets[0];

    await client.query(
      `INSERT INTO refund_liabilities (
         id, "refundRequestId", "orderId", "eventId", "sessionId",
         amount, status, "approvedAt", "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, 'unpaid', now(), now())
       ON CONFLICT ("refundRequestId") DO NOTHING`,
      [
        liabilityId,
        request.id,
        request.orderId,
        firstTicket.eventId,
        firstTicket.sessionId,
        Number(request.requestedAmount),
      ],
    );

    // 6. Update refund request status to approved
    await client.query(
      `UPDATE refund_requests
       SET status = 'approved',
           "reviewedAt" = now(),
           "reviewedByUserId" = $2,
           "reviewedByName" = $3,
           "updatedAt" = now()
       WHERE id = $1`,
      [request.id, input.reviewerUserId, input.reviewerName],
    );

    await client.query('COMMIT');

    // AC-90: Quota returned for sale if session is approved; not for sale if cancelled
    const sessionStatus = firstTicket.sessionStatus;
    const quotaReturned = sessionStatus === 'approved';

    return {
      success: true,
      refundRequestId: request.id,
      status: 'approved',
      revokedTicketCount: tickets.length,
      liabilityAmount: Number(request.requestedAmount),
      quotaReturned,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface SessionCancellationRefundResult {
  revokedTicketCount: number;
  refundCasesCreated: number;
  totalLiabilityAmount: number;
}

/**
 * Automatically revokes eligible issued tickets and creates refund cases/liabilities
 * when an event session is cancelled by Owner (AC-35, AC-91, G-22, G-38, R5).
 *
 * Rules:
 * - Tickets that have already been admitted (entry success log or admissionStatus inside)
 *   cannot be refunded (G-22).
 * - Existing pending refund requests are approved (linking existing case per G-38).
 * - Existing approved/completed refund requests already have liabilities; they are not duplicated (G-38).
 * - Eligible issued tickets without prior refund requests are grouped by order,
 *   and refund cases are created with status 'approved' and refund liability 'unpaid' (R5, AC-35, AC-91).
 * - Refund amount is strictly ticket face value excluding customer service fee (R5).
 * - Quota is NOT returned for sale since session is cancelled (AC-90).
 */
export async function processSessionCancellationRefunds(
  client: PoolClient,
  input: {
    sessionId: string;
    eventId: string;
    ownerId: string;
    ownerName: string;
    now?: Date;
  },
): Promise<SessionCancellationRefundResult> {
  const currentTime = input.now || new Date();

  // 1. Fetch all tickets for this session
  const ticketsRes = await client.query<{
    id: string;
    orderId: string;
    ticketCode: string;
    status: string;
    admissionStatus: string;
    ticketPrice: number;
    buyerEmail: string;
    buyerPhone: string;
    buyerName: string;
    orderStatus: string;
  }>(
    `SELECT t.id, t."orderId", t."ticketCode", t.status, t."admissionStatus",
            tt.price AS "ticketPrice",
            o."buyerEmail", o."buyerPhone", o."buyerName", o.status AS "orderStatus"
     FROM tickets t
     JOIN ticket_types tt ON tt.id = t."ticketTypeId"
     JOIN orders o ON o.id = t."orderId"
     WHERE t."sessionId" = $1
     FOR UPDATE OF t`,
    [input.sessionId],
  );

  if (ticketsRes.rowCount === 0) {
    return { revokedTicketCount: 0, refundCasesCreated: 0, totalLiabilityAmount: 0 };
  }

  const allTickets = ticketsRes.rows;
  const ticketIds = allTickets.map(t => t.id);

  // 2. Check admission history (G-22): Any ticket that entered is not refundable
  const admRes = await client.query<{ ticketId: string }>(
    `SELECT DISTINCT "ticketId"
     FROM ticket_admission_logs
     WHERE "ticketId" = ANY($1) AND action = 'entry' AND status = 'success'`,
    [ticketIds],
  );
  const admittedSet = new Set(admRes.rows.map(r => r.ticketId));

  // 3. Check existing refund requests (G-38)
  const existingRefundsRes = await client.query<{
    ticketId: string;
    refundRequestId: string;
    refundStatus: string;
  }>(
    `SELECT rri."ticketId", rri."refundRequestId", rr.status AS "refundStatus"
     FROM refund_request_items rri
     JOIN refund_requests rr ON rr.id = rri."refundRequestId"
     WHERE rri."ticketId" = ANY($1) AND rr.status IN ('pending', 'approved', 'completed')`,
    [ticketIds],
  );
  const refundMap = new Map<string, { refundRequestId: string; refundStatus: string }>();
  for (const row of existingRefundsRes.rows) {
    refundMap.set(row.ticketId, {
      refundRequestId: row.refundRequestId,
      refundStatus: row.refundStatus,
    });
  }

  let revokedTicketCount = 0;
  let refundCasesCreated = 0;
  let totalLiabilityAmount = 0;

  // Track pending refund requests that need to be transitioned to approved
  const pendingRequestsToApprove = new Set<string>();

  // Filter tickets that need new automatic refund cases
  const ticketsNeedingNewCase: typeof allTickets = [];

  for (const ticket of allTickets) {
    const isAdmitted = admittedSet.has(ticket.id) || ticket.admissionStatus === 'inside';
    if (isAdmitted) {
      // Admitted ticket: cannot be refunded (G-22)
      continue;
    }

    const existingRefund = refundMap.get(ticket.id);
    if (existingRefund) {
      if (existingRefund.refundStatus === 'pending') {
        // Ticket already has a pending refund request: link and approve it!
        pendingRequestsToApprove.add(existingRefund.refundRequestId);
      }
      // If already approved or completed, liability already recorded and ticket revoked; skip
      continue;
    }

    // Only valid issued tickets get automatic refund cases
    if (ticket.status === 'valid') {
      ticketsNeedingNewCase.push(ticket);
    }
  }

  // A. Approve existing pending refund requests that match tickets in this cancelled session
  for (const reqId of pendingRequestsToApprove) {
    const reqRes = await client.query<{
      id: string;
      orderId: string;
      requestedAmount: number;
      status: string;
    }>(
      `SELECT id, "orderId", "requestedAmount", status
       FROM refund_requests
       WHERE id = $1 AND status = 'pending'
       FOR UPDATE`,
      [reqId],
    );

    if (reqRes.rowCount && reqRes.rowCount > 0) {
      const r = reqRes.rows[0];
      const amount = Number(r.requestedAmount);

      // Record refund liability
      const liabilityId = `LIA-${randomUUID().slice(0, 8).toUpperCase()}`;
      await client.query(
        `INSERT INTO refund_liabilities (
           id, "refundRequestId", "orderId", "eventId", "sessionId",
           amount, status, "approvedAt", "createdAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, 'unpaid', $7, $7)
         ON CONFLICT ("refundRequestId") DO NOTHING`,
        [liabilityId, r.id, r.orderId, input.eventId, input.sessionId, amount, currentTime],
      );

      // Update refund request to approved
      await client.query(
        `UPDATE refund_requests
         SET status = 'approved',
             "reviewedAt" = $2,
             "reviewedByUserId" = $3,
             "reviewedByName" = $4,
             "updatedAt" = $2
         WHERE id = $1`,
        [r.id, currentTime, input.ownerId, input.ownerName],
      );

      // Revoke tickets in this request
      const itemsRes = await client.query<{ ticketId: string }>(
        `SELECT "ticketId" FROM refund_request_items WHERE "refundRequestId" = $1`,
        [r.id],
      );
      const reqTicketIds = itemsRes.rows.map(item => item.ticketId);
      if (reqTicketIds.length > 0) {
        await client.query(
          `UPDATE tickets SET status = 'refunded', "updatedAt" = $2 WHERE id = ANY($1)`,
          [reqTicketIds, currentTime],
        );
        revokedTicketCount += reqTicketIds.length;
      }
      totalLiabilityAmount += amount;
    }
  }

  // B. Group remaining eligible tickets by order and create new refund cases
  const ticketsByOrder = new Map<string, typeof allTickets>();
  for (const ticket of ticketsNeedingNewCase) {
    const list = ticketsByOrder.get(ticket.orderId) || [];
    list.push(ticket);
    ticketsByOrder.set(ticket.orderId, list);
  }

  for (const [orderId, orderTickets] of ticketsByOrder.entries()) {
    const firstTicket = orderTickets[0];
    const orderAmount = orderTickets.reduce((sum, t) => sum + Number(t.ticketPrice), 0);
    const refundRequestId = `REF-${randomUUID().slice(0, 8).toUpperCase()}`;

    // Create refund request (status = 'approved', waiting for owner manual transfer)
    await client.query(
      `INSERT INTO refund_requests (
         id, "orderId", "buyerEmail", "buyerPhone", "buyerName",
         "requestedAmount", reason, status,
         "submittedAt", "reviewedAt", "reviewedByUserId", "reviewedByName",
         "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $8, $9, $10, $8, $8)`,
      [
        refundRequestId,
        orderId,
        firstTicket.buyerEmail,
        firstTicket.buyerPhone,
        firstTicket.buyerName,
        orderAmount,
        'รอบการแสดงถูกยกเลิก (Session Cancelled)',
        currentTime,
        input.ownerId,
        input.ownerName,
      ],
    );

    // Insert items
    for (const t of orderTickets) {
      await client.query(
        `INSERT INTO refund_request_items (
           id, "refundRequestId", "ticketId", "ticketCode", "ticketPrice", "createdAt"
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), refundRequestId, t.id, t.ticketCode, Number(t.ticketPrice), currentTime],
      );
    }

    // Insert liability
    const liabilityId = `LIA-${randomUUID().slice(0, 8).toUpperCase()}`;
    await client.query(
      `INSERT INTO refund_liabilities (
         id, "refundRequestId", "orderId", "eventId", "sessionId",
         amount, status, "approvedAt", "createdAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, 'unpaid', $7, $7)
       ON CONFLICT ("refundRequestId") DO NOTHING`,
      [liabilityId, refundRequestId, orderId, input.eventId, input.sessionId, orderAmount, currentTime],
    );

    // Revoke tickets
    const orderTicketIds = orderTickets.map(t => t.id);
    await client.query(
      `UPDATE tickets SET status = 'refunded', "updatedAt" = $2 WHERE id = ANY($1)`,
      [orderTicketIds, currentTime],
    );

    revokedTicketCount += orderTickets.length;
    refundCasesCreated += 1;
    totalLiabilityAmount += orderAmount;
  }

  return { revokedTicketCount, refundCasesCreated, totalLiabilityAmount };
}

/**
 * Owner rejects a refund request.
 */
export async function rejectRefundRequest(
  pool: Pool,
  input: RejectRefundInput,
): Promise<{ success: boolean; error?: string; code?: string }> {
  await ensureRefundSchema(pool);

  if (input.reviewerRole !== 'owner') {
    return {
      success: false,
      error: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์ปฏิเสธคำขอคืนเงิน',
      code: 'FORBIDDEN',
    };
  }

  if (!input.rejectionReason?.trim()) {
    return {
      success: false,
      error: 'กรุณาระบุเหตุผลการปฏิเสธคำขอ',
      code: 'INVALID_INPUT',
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM refund_requests WHERE id = $1 FOR UPDATE`,
      [input.refundRequestId],
    );

    if (reqRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'ไม่พบคำขอคืนเงิน', code: 'NOT_FOUND' };
    }

    const request = reqRes.rows[0];
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: `คำขอนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ (สถานะปัจจุบัน: ${request.status})`,
        code: 'INVALID_STATUS',
      };
    }

    await client.query(
      `UPDATE refund_requests
       SET status = 'rejected',
           "rejectionReason" = $2,
           "reviewedAt" = now(),
           "reviewedByUserId" = $3,
           "reviewedByName" = $4,
           "updatedAt" = now()
       WHERE id = $1`,
      [request.id, input.rejectionReason.trim(), input.reviewerUserId, input.reviewerName],
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieve all refund requests for owner dashboard.
 */
export async function listAllRefundRequests(
  pool: Pool,
  filters?: { status?: string },
): Promise<OwnerRefundRequestItem[]> {
  await ensureRefundSchema(pool);

  const params: unknown[] = [];
  let whereClause = '';

  if (filters?.status && filters.status !== 'all') {
    params.push(filters.status);
    whereClause = `WHERE rr.status = $${params.length}`;
  }

  const res = await pool.query<{
    id: string;
    orderId: string;
    eventId: string;
    eventTitle: string;
    sessionId: string;
    sessionStatus: string;
    buyerEmail: string;
    buyerPhone: string;
    buyerName: string;
    requestedAmount: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed';
    bankName: string | null;
    bankAccountNo: string | null;
    bankAccountName: string | null;
    submittedAt: Date;
    reviewedAt: Date | null;
    reviewedByName: string | null;
    rejectionReason: string | null;
    transferredAt: Date | null;
    transferredAmount: number | null;
    transferProofKey: string | null;
    transferProofUrl: string | null;
    transferNote: string | null;
    transferFailureReason: string | null;
    transferFailedAt: Date | null;
    liabilityStatus: 'unpaid' | 'settled' | null;
  }>(
    `SELECT rr.id, rr."orderId", rr."buyerEmail", rr."buyerPhone", rr."buyerName",
            rr."requestedAmount", rr.reason, rr.status, rr."bankName", rr."bankAccountNo", rr."bankAccountName",
            rr."submittedAt", rr."reviewedAt", rr."reviewedByName", rr."rejectionReason",
            rr."transferredAt", rr."transferredAmount", rr."transferProofKey", rr."transferProofUrl",
            rr."transferNote", rr."transferFailureReason", rr."transferFailedAt",
            rl.status AS "liabilityStatus",
            o."eventId", o."sessionId", e.title AS "eventTitle", es.status AS "sessionStatus"
     FROM refund_requests rr
     JOIN orders o ON o.id = rr."orderId"
     JOIN events e ON e.id = o."eventId"
     JOIN event_sessions es ON es.id = o."sessionId"
     LEFT JOIN refund_liabilities rl ON rl."refundRequestId" = rr.id
     ${whereClause}
     ORDER BY rr."submittedAt" DESC`,
    params,
  );

  const results: OwnerRefundRequestItem[] = [];

  for (const r of res.rows) {
    const itemsRes = await pool.query<{
      id: string;
      ticketId: string;
      ticketCode: string;
      ticketPrice: number;
    }>(
      `SELECT id, "ticketId", "ticketCode", "ticketPrice"
       FROM refund_request_items
       WHERE "refundRequestId" = $1
       ORDER BY "ticketCode" ASC`,
      [r.id],
    );

    results.push({
      id: r.id,
      orderId: r.orderId,
      eventId: r.eventId,
      eventTitle: r.eventTitle,
      sessionId: r.sessionId,
      sessionStatus: r.sessionStatus,
      buyerEmail: r.buyerEmail,
      buyerPhone: r.buyerPhone,
      buyerName: r.buyerName,
      requestedAmount: Number(r.requestedAmount),
      reason: r.reason,
      status: r.status,
      bankName: r.bankName,
      bankAccountNo: r.bankAccountNo,
      bankAccountName: r.bankAccountName,
      submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : String(r.submittedAt),
      reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : r.reviewedAt ? String(r.reviewedAt) : null,
      reviewedByName: r.reviewedByName,
      rejectionReason: r.rejectionReason,
      transferredAt: r.transferredAt instanceof Date ? r.transferredAt.toISOString() : r.transferredAt ? String(r.transferredAt) : null,
      transferredAmount: r.transferredAmount !== null && r.transferredAmount !== undefined ? Number(r.transferredAmount) : null,
      transferProofKey: r.transferProofKey,
      transferProofUrl: r.transferProofUrl,
      transferNote: r.transferNote,
      transferFailureReason: r.transferFailureReason,
      transferFailedAt: r.transferFailedAt instanceof Date ? r.transferFailedAt.toISOString() : r.transferFailedAt ? String(r.transferFailedAt) : null,
      liabilityStatus: r.liabilityStatus,
      items: itemsRes.rows.map(item => ({
        id: item.id,
        ticketId: item.ticketId,
        ticketCode: item.ticketCode,
        ticketPrice: Number(item.ticketPrice),
      })),
    });
  }

  return results;
}

export interface RecordManualRefundTransferInput {
  refundRequestId: string;
  transferredAmount?: number;
  transferProofKey?: string;
  transferProofUrl?: string;
  transferNote?: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerRole: string;
  transferredAt?: Date;
}

export interface RecordManualRefundTransferResult {
  success: boolean;
  status: string;
  alreadyCompleted?: boolean;
  transferredAmount?: number;
  transferredAt?: string;
  transferProofKey?: string;
  error?: string;
  code?: string;
}

/**
 * Owner records manual bank transfer completion for an approved refund (AC-37, AC-93, G-36).
 * Idempotent: Settles refund liability and updates status to 'completed'.
 * Does not re-revoke or re-return quota.
 */
export async function recordManualRefundTransfer(
  pool: Pool,
  input: RecordManualRefundTransferInput,
): Promise<RecordManualRefundTransferResult> {
  if (input.reviewerRole !== 'owner') {
    return {
      success: false,
      status: 'error',
      code: 'FORBIDDEN',
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่สามารถบันทึกการโอนเงินคืนได้ (AC-37, AC-92)',
    };
  }

  await ensureRefundSchema(pool);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query<{
      id: string;
      orderId: string;
      status: string;
      requestedAmount: number;
      buyerEmail: string;
      transferredAmount: number | null;
      transferredAt: Date | null;
    }>(
      `SELECT id, "orderId", status, "requestedAmount", "buyerEmail",
              "transferredAmount", "transferredAt"
       FROM refund_requests
       WHERE id = $1
       FOR UPDATE`,
      [input.refundRequestId],
    );

    if (reqRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 'error',
        code: 'NOT_FOUND',
        error: 'ไม่พบคำขอคืนเงินที่ระบุ',
      };
    }

    const req = reqRes.rows[0];

    // Idempotency: if already completed, do not record or settle duplicate (AC-107, G-36)
    if (req.status === 'completed') {
      await client.query('COMMIT');
      return {
        success: true,
        status: 'completed',
        alreadyCompleted: true,
        transferredAmount: Number(req.transferredAmount ?? req.requestedAmount),
        transferredAt: req.transferredAt?.toISOString() ?? new Date().toISOString(),
      };
    }

    if (req.status === 'rejected') {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: req.status,
        code: 'REQUEST_ALREADY_REJECTED',
        error: 'คำขอคืนเงินนี้ถูกปฏิเสธแล้ว ไม่สามารถบันทึกการโอนเงินได้',
      };
    }

    if (req.status === 'pending') {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: req.status,
        code: 'REQUEST_NOT_APPROVED',
        error: 'คำขอคืนเงินนี้ยังไม่ได้รับการอนุมัติ (กรุณาอนุมัติคำขอก่อนบันทึกการโอนเงิน)',
      };
    }

    const transferAmount = input.transferredAmount !== undefined
      ? Number(input.transferredAmount)
      : Number(req.requestedAmount);
    const transferTime = input.transferredAt ?? new Date();

    // Settle liability in refund_liabilities (AC-37, G-36)
    await client.query(
      `UPDATE refund_liabilities
       SET status = 'settled', "settledAt" = $2
       WHERE "refundRequestId" = $1 AND status != 'settled'`,
      [req.id, transferTime],
    );

    // Update refund_requests
    await client.query(
      `UPDATE refund_requests
       SET status = 'completed',
           "transferredAt" = $2,
           "transferredAmount" = $3,
           "transferProofKey" = $4,
           "transferProofUrl" = $5,
           "transferNote" = $6,
           "updatedAt" = now()
       WHERE id = $1`,
      [
        req.id,
        transferTime,
        transferAmount,
        input.transferProofKey ?? null,
        input.transferProofUrl ?? null,
        input.transferNote ?? null,
      ],
    );

    await client.query('COMMIT');

    return {
      success: true,
      status: 'completed',
      transferredAmount: transferAmount,
      transferredAt: transferTime.toISOString(),
      transferProofKey: input.transferProofKey,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface RecordManualRefundFailureInput {
  refundRequestId: string;
  failureReason: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerRole: string;
}

export interface RecordManualRefundFailureResult {
  success: boolean;
  status: string;
  liabilityStatus: string;
  failureReason?: string;
  error?: string;
  code?: string;
}

/**
 * Owner records manual bank transfer failure/retry (AC-93).
 * Preserves revoked tickets, keeps liability unpaid, and does not alter status to completed.
 */
export async function recordManualRefundFailure(
  pool: Pool,
  input: RecordManualRefundFailureInput,
): Promise<RecordManualRefundFailureResult> {
  if (input.reviewerRole !== 'owner') {
    return {
      success: false,
      status: 'error',
      liabilityStatus: 'unpaid',
      code: 'FORBIDDEN',
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่สามารถบันทึกสถานะการโอนเงินล้มเหลวได้',
    };
  }

  if (!input.failureReason?.trim()) {
    return {
      success: false,
      status: 'error',
      liabilityStatus: 'unpaid',
      code: 'VALIDATION_ERROR',
      error: 'กรุณาระบุเหตุผลที่การโอนเงินล้มเหลว',
    };
  }

  await ensureRefundSchema(pool);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status FROM refund_requests WHERE id = $1 FOR UPDATE`,
      [input.refundRequestId],
    );

    if (reqRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 'error',
        liabilityStatus: 'unpaid',
        code: 'NOT_FOUND',
        error: 'ไม่พบคำขอคืนเงินที่ระบุ',
      };
    }

    const req = reqRes.rows[0];

    if (req.status === 'completed') {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 'completed',
        liabilityStatus: 'settled',
        code: 'ALREADY_COMPLETED',
        error: 'คำขอคืนเงินนี้โอนเงินสำเร็จแล้ว ไม่สามารถบันทึกล้มเหลวย้อนหลังได้',
      };
    }

    if (req.status === 'rejected' || req.status === 'pending') {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: req.status,
        liabilityStatus: 'unpaid',
        code: 'INVALID_STATUS',
        error: `คำขออยู่ในสถานะ "${req.status}" ไม่สามารถบันทึกการโอนล้มเหลวได้`,
      };
    }

    // AC-93: Keep status as approved, liability remains unpaid.
    await client.query(
      `UPDATE refund_requests
       SET "transferFailureReason" = $2,
           "transferFailedAt" = now(),
           "updatedAt" = now()
       WHERE id = $1`,
      [req.id, input.failureReason.trim()],
    );

    await client.query('COMMIT');

    return {
      success: true,
      status: req.status, // approved
      liabilityStatus: 'unpaid', // AC-93: liability is still pending/held
      failureReason: input.failureReason.trim(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieve refund transfer proof file (AC-92).
 * Strictly enforced: Only owner can access proof files.
 */
export async function getRefundTransferProof(
  pool: Pool,
  input: {
    refundRequestId: string;
    actorRole: string;
  },
): Promise<{
  success: boolean;
  data?: Buffer;
  contentType?: string;
  error?: string;
  code?: string;
}> {
  // AC-92: Only owner can download or access proof file
  if (input.actorRole !== 'owner') {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์เปิดดูไฟล์หลักฐานการโอนเงิน (AC-92)',
    };
  }

  await ensureRefundSchema(pool);

  const res = await pool.query<{
    id: string;
    transferProofKey: string | null;
  }>(
    `SELECT id, "transferProofKey" FROM refund_requests WHERE id = $1`,
    [input.refundRequestId],
  );

  if (res.rowCount === 0 || !res.rows[0].transferProofKey) {
    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'ไม่พบไฟล์หลักฐานการโอนเงินของคำขอนี้',
    };
  }

  const item = await storage.get(res.rows[0].transferProofKey);
  if (!item) {
    return {
      success: false,
      code: 'FILE_NOT_FOUND',
      error: 'ไฟล์หลักฐานไม่พบบนระบบจัดเก็บข้อมูล',
    };
  }

  return {
    success: true,
    data: item.data,
    contentType: item.contentType,
  };
}
