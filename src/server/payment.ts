import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from './database.ts';
import { getVerifiedGuestSession } from './guest-otp.ts';
import { ensureReservationSchema } from './reservation.ts';
import { ensureTicketSchema, issueTicketsForOrder, type TicketDetail } from './tickets.ts';
import { ensureRefundSchema } from './refunds.ts';
import { sendOrderTicketsEmail } from './ticket-delivery.ts';

export interface PaymentChargeDetail {
  id: string;
  orderId: string;
  amount: number; // satang
  currency: 'thb';
  status: 'pending' | 'successful' | 'failed' | 'expired';
  qrCodeUrl: string;
  expiresAt: string;
  createdAt: string;
}

export interface PaymentRecoveryCaseDetail {
  id: string;
  orderId: string;
  chargeId: string;
  reason: 'paid_after_deadline' | 'insufficient_quota' | 'paid_after_cancellation';
  amount: number; // total in THB (including customer fee)
  customerFee: number;
  subtotal: number;
  status: 'pending_review' | 'resolved' | 'refunded';
  providerPaidAt: string;
  orderExpiresAt: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export async function ensurePaymentSchema(pool: Pool): Promise<void> {
  await ensureReservationSchema(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_charges (
      id TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'thb',
      status TEXT NOT NULL DEFAULT 'pending',
      "qrCodeUrl" TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "paidAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_payment_charges_order ON payment_charges("orderId");
    CREATE INDEX IF NOT EXISTS idx_payment_charges_status ON payment_charges(status);

    CREATE TABLE IF NOT EXISTS payment_recovery_cases (
      id TEXT PRIMARY KEY,
      "orderId" TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      "chargeId" TEXT NOT NULL UNIQUE REFERENCES payment_charges(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      "customerFee" NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      "providerPaidAt" TIMESTAMPTZ NOT NULL,
      "orderExpiresAt" TIMESTAMPTZ NOT NULL,
      "buyerName" TEXT NOT NULL,
      "buyerEmail" TEXT NOT NULL,
      "buyerPhone" TEXT NOT NULL,
      notes TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_recovery_cases_order ON payment_recovery_cases("orderId");
    CREATE INDEX IF NOT EXISTS idx_recovery_cases_charge ON payment_recovery_cases("chargeId");
    CREATE INDEX IF NOT EXISTS idx_recovery_cases_status ON payment_recovery_cases(status);
  `);
}

/**
 * Generates an SVG QR placeholder for PromptPay with embedded payload for local/test double.
 */
function generatePromptPaySvg(chargeId: string, amountSatang: number): string {
  const amountBaht = (amountSatang / 100).toFixed(2);
  // Valid SVG representing PromptPay QR box (no emojis, clean vector lines)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" style="background:#ffffff;border-radius:8px">
    <rect width="240" height="240" fill="#ffffff"/>
    <rect x="20" y="20" width="60" height="60" fill="#1848ed" rx="4"/>
    <rect x="30" y="30" width="40" height="40" fill="#ffffff" rx="2"/>
    <rect x="40" y="40" width="20" height="20" fill="#1848ed"/>
    <rect x="160" y="20" width="60" height="60" fill="#1848ed" rx="4"/>
    <rect x="170" y="30" width="40" height="40" fill="#ffffff" rx="2"/>
    <rect x="180" y="40" width="20" height="20" fill="#1848ed"/>
    <rect x="20" y="160" width="60" height="60" fill="#1848ed" rx="4"/>
    <rect x="30" y="170" width="40" height="40" fill="#ffffff" rx="2"/>
    <rect x="40" y="180" width="20" height="20" fill="#1848ed"/>
    <rect x="100" y="25" width="40" height="15" fill="#0f172a"/>
    <rect x="95" y="55" width="20" height="25" fill="#0f172a"/>
    <rect x="125" y="50" width="25" height="30" fill="#0f172a"/>
    <rect x="90" y="90" width="60" height="60" fill="#1848ed" rx="4"/>
    <circle cx="120" cy="120" r="16" fill="#ffffff"/>
    <rect x="114" y="110" width="12" height="20" fill="#1848ed"/>
    <rect x="25" y="95" width="55" height="20" fill="#0f172a"/>
    <rect x="30" y="125" width="50" height="25" fill="#0f172a"/>
    <rect x="160" y="95" width="55" height="25" fill="#0f172a"/>
    <rect x="165" y="130" width="50" height="20" fill="#0f172a"/>
    <rect x="95" y="160" width="30" height="55" fill="#0f172a"/>
    <rect x="135" y="160" width="25" height="55" fill="#0f172a"/>
    <rect x="170" y="165" width="50" height="50" fill="#0f172a"/>
    <text x="120" y="232" font-family="sans-serif" font-size="9" fill="#64748b" text-anchor="middle">PromptPay • ${amountBaht} THB • ${chargeId.slice(0, 12)}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function createPaymentQr(
  pool: Pool,
  input: { orderId: string; verifiedToken: string },
  now = new Date(),
): Promise<PaymentChargeDetail> {
  if (!input.orderId) {
    throw new Error('กรุณาระบุหมายเลขคำสั่งซื้อ');
  }

  // AC-12: Must validate OTP token before creating payment QR
  const verifiedSession = await getVerifiedGuestSession(pool, input.verifiedToken, now);
  if (!verifiedSession) {
    throw new Error('กรุณายืนยันตัวตนผ่าน OTP ก่อนขอรับ QR ชำระเงิน (AC-12)');
  }

  await ensurePaymentSchema(pool);

  return inTransaction(pool, async (client: PoolClient) => {
    // 1. Lock and read order
    const orderRes = await client.query<{
      id: string;
      buyerEmail: string;
      status: string;
      total: number;
      expiresAt: Date;
      sessionStatus: string;
    }>(
      `SELECT o.id, o."buyerEmail", o.status, o.total, o."expiresAt", es.status AS "sessionStatus"
       FROM orders o
       JOIN event_sessions es ON es.id = o."sessionId"
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [input.orderId],
    );

    if (orderRes.rowCount === 0) {
      throw new Error('ไม่พบคำสั่งซื้อที่ระบุ');
    }

    const order = orderRes.rows[0];

    // AC-35: Rejects payment if session is cancelled
    if (order.sessionStatus === 'cancelled') {
      throw new Error('รอบการแสดงถูกยกเลิกแล้ว ไม่สามารถทำรายการชำระเงินได้ (AC-35)');
    }

    // AC-12: Order buyerEmail must match verified OTP session email
    if (order.buyerEmail.toLowerCase() !== verifiedSession.email.toLowerCase()) {
      throw new Error('ท่านไม่มีสิทธิ์ในการชำระเงินสำหรับคำสั่งซื้อนี้');
    }

    // AC-13, AC-71: Order must be active reserved and not expired
    const expiresAt = new Date(order.expiresAt);
    if (order.status !== 'reserved' || expiresAt.getTime() <= now.getTime()) {
      // Auto-expire if past deadline
      if (order.status === 'reserved' && expiresAt.getTime() <= now.getTime()) {
        await client.query(
          `UPDATE orders SET status = 'expired', "updatedAt" = $2 WHERE id = $1`,
          [order.id, now],
        );
      }
      throw new Error('คำสั่งซื้อนี้หมดเวลาการกันบัตรหรือถูกยกเลิกแล้ว (AC-71)');
    }

    // AC-70: Repeated payment request returns existing charge and retains original deadline
    const existingRes = await client.query(
      `SELECT id, "orderId", amount, currency, status, "qrCodeUrl", "expiresAt", "createdAt"
       FROM payment_charges
       WHERE "orderId" = $1 AND status = 'pending'
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [order.id],
    );

    if (existingRes.rowCount && existingRes.rowCount > 0) {
      const row = existingRes.rows[0];
      return {
        id: row.id,
        orderId: row.orderId,
        amount: Number(row.amount),
        currency: row.currency as 'thb',
        status: row.status as 'pending',
        qrCodeUrl: row.qrCodeUrl,
        expiresAt: new Date(row.expiresAt).toISOString(),
        createdAt: new Date(row.createdAt).toISOString(),
      };
    }

    // 2. Convert total to exact satang (integer) conforming to AC-26 and Omise PromptPay spec
    const amountSatang = Math.round(Number(order.total) * 100);
    if (amountSatang <= 0) {
      throw new Error('ยอดชำระเงินต้องมากกว่า 0 บาท');
    }

    // 3. Create charge ID and QR code URL
    const chargeId = `chrg_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const qrCodeUrl = generatePromptPaySvg(chargeId, amountSatang);

    await client.query(
      `INSERT INTO payment_charges (
         id, "orderId", amount, currency, status, "qrCodeUrl", "expiresAt", "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, 'thb', 'pending', $4, $5, $6, $6)`,
      [chargeId, order.id, amountSatang, qrCodeUrl, expiresAt, now],
    );

    return {
      id: chargeId,
      orderId: order.id,
      amount: amountSatang,
      currency: 'thb',
      status: 'pending',
      qrCodeUrl,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    };
  });
}

export async function getPaymentChargeForOrder(
  pool: Pool,
  orderId: string,
): Promise<PaymentChargeDetail | null> {
  await ensurePaymentSchema(pool);
  const res = await pool.query(
    `SELECT id, "orderId", amount, currency, status, "qrCodeUrl", "expiresAt", "createdAt"
     FROM payment_charges
     WHERE "orderId" = $1
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [orderId],
  );

  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    orderId: row.orderId,
    amount: Number(row.amount),
    currency: row.currency as 'thb',
    status: row.status as 'pending' | 'successful' | 'failed' | 'expired',
    qrCodeUrl: row.qrCodeUrl,
    expiresAt: new Date(row.expiresAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export interface ProcessPaymentInput {
  chargeId: string;
  providerPaidAt?: Date;
  actualAmount?: number;
  actualCurrency?: string;
}

export interface ProcessPaymentResult {
  success: boolean;
  orderId: string;
  status:
    | 'paid'
    | 'paid_after_deadline'
    | 'insufficient_quota'
    | 'mismatch'
    | 'cancelled_session_refund_face_value'
    | 'cancelled_session_refund_full';
  message: string;
  tickets?: TicketDetail[];
  caseId?: string;
  recoveryCase?: PaymentRecoveryCaseDetail;
  refundRequestId?: string;
  refundAmount?: number;
}

export async function verifyAndProcessPayment(
  pool: Pool,
  input: ProcessPaymentInput,
  now = new Date(),
): Promise<ProcessPaymentResult> {
  await ensurePaymentSchema(pool);
  await ensureTicketSchema(pool);
  await ensureRefundSchema(pool);

  const result: ProcessPaymentResult = await inTransaction(pool, async (client: PoolClient): Promise<ProcessPaymentResult> => {
    // 1. Lock payment charge
    const chargeRes = await client.query(
      `SELECT id, "orderId", amount, currency, status, "expiresAt"
       FROM payment_charges
       WHERE id = $1
       FOR UPDATE`,
      [input.chargeId],
    );

    if (chargeRes.rowCount === 0) {
      throw new Error('ไม่พบรายการชำระเงินที่ระบุ');
    }

    const charge = chargeRes.rows[0];

    // 2. Lock order with session status and cancellation info
    const orderRes = await client.query<{
      id: string;
      eventId: string;
      sessionId: string;
      status: string;
      total: number;
      subtotal: number;
      customerFee: number;
      buyerEmail: string;
      buyerName: string;
      buyerPhone: string;
      expiresAt: Date;
      sessionStatus: string;
      sessionUpdatedAt: Date;
      cancellationApprovedAt: Date | null;
    }>(
      `SELECT o.id, o."eventId", o."sessionId", o.status, o.total, o.subtotal, o."customerFee",
              o."buyerEmail", o."buyerName", o."buyerPhone", o."expiresAt",
              es.status AS "sessionStatus",
              es."updatedAt" AS "sessionUpdatedAt",
              sc."reviewedAt" AS "cancellationApprovedAt"
       FROM orders o
       JOIN event_sessions es ON es.id = o."sessionId"
       LEFT JOIN session_cancellations sc ON sc."sessionId" = o."sessionId" AND sc.status = 'approved'
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [charge.orderId],
    );

    if (orderRes.rowCount === 0) {
      throw new Error('ไม่พบคำสั่งซื้อที่ผูกกับรายการชำระเงินนี้');
    }

    const order = orderRes.rows[0];

    // Idempotency: Check if refund request already exists for this order (AC-18, AC-107, G-36)
    const existingRefundRes = await client.query<{
      id: string;
      requestedAmount: number;
      reason: string;
      status: string;
    }>(
      `SELECT id, "requestedAmount", reason, status
       FROM refund_requests
       WHERE "orderId" = $1
       LIMIT 1`,
      [order.id],
    );

    if (existingRefundRes.rowCount && existingRefundRes.rowCount > 0) {
      const ex = existingRefundRes.rows[0];
      const isG51FaceValue = ex.reason?.includes('G-51');
      const isG52Full = ex.reason?.includes('G-52');
      const isFullRefund = isG52Full || (!isG51FaceValue && Math.round(Number(ex.requestedAmount) * 100) === Math.round(Number(order.total) * 100));
      return {
        success: false,
        orderId: order.id,
        status: isFullRefund ? 'cancelled_session_refund_full' : 'cancelled_session_refund_face_value',
        message: 'รายการชำระเงินนี้ได้รับการประมวลผลการคืนเงินสำหรับรอบที่ยกเลิกแล้ว',
        refundRequestId: ex.id,
        refundAmount: Number(ex.requestedAmount),
      };
    }

    // AC-18: If order is already paid and has issued tickets, return existing tickets idempotently
    if (order.status === 'paid') {
      const existingTicketsRes = await client.query(
        `SELECT id FROM tickets WHERE "orderId" = $1 AND status = 'valid'`,
        [order.id],
      );
      if (existingTicketsRes.rowCount && existingTicketsRes.rowCount > 0) {
        const tickets = await issueTicketsForOrder(client, order.id, now);
        return {
          success: true,
          orderId: order.id,
          status: 'paid',
          message: 'คำสั่งซื้อนี้ชำระเงินและออกบัตรเรียบร้อยแล้ว',
          tickets,
        };
      }
    }

    // Check if recovery case already exists for this charge (Idempotency AC-18, G-35)
    const existingCaseRes = await client.query(
      `SELECT id, "orderId", "chargeId", reason, amount, "customerFee", subtotal,
              status, "providerPaidAt", "orderExpiresAt", "buyerName", "buyerEmail",
              "buyerPhone", notes, "createdAt", "updatedAt"
       FROM payment_recovery_cases
       WHERE "chargeId" = $1`,
      [charge.id],
    );

    if (existingCaseRes.rowCount && existingCaseRes.rowCount > 0) {
      const r = existingCaseRes.rows[0];
      const recoveryCase: PaymentRecoveryCaseDetail = {
        id: r.id,
        orderId: r.orderId,
        chargeId: r.chargeId,
        reason: r.reason as 'paid_after_deadline' | 'insufficient_quota' | 'paid_after_cancellation',
        amount: Number(r.amount),
        customerFee: Number(r.customerFee),
        subtotal: Number(r.subtotal),
        status: r.status as 'pending_review',
        providerPaidAt: new Date(r.providerPaidAt).toISOString(),
        orderExpiresAt: new Date(r.orderExpiresAt).toISOString(),
        buyerName: r.buyerName,
        buyerEmail: r.buyerEmail,
        buyerPhone: r.buyerPhone,
        notes: r.notes || undefined,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      };

      return {
        success: false,
        orderId: order.id,
        status: recoveryCase.reason === 'paid_after_cancellation' ? 'cancelled_session_refund_full' : recoveryCase.reason,
        message:
          recoveryCase.reason === 'paid_after_deadline'
            ? 'ชำระเงินเกินกำหนดเวลา 15 นาที ระบบส่งเรื่องให้เจ้าหน้าที่ตรวจสอบเพื่อคืนเงินเต็มจำนวน (รวมค่าบริการ)'
            : recoveryCase.reason === 'paid_after_cancellation'
              ? 'รอบการแสดงถูกยกเลิกขณะหรือก่อนชำระเงิน ระบบเปิดเคสคืนเงินเต็มจำนวนรวมค่าบริการ'
              : 'โควตาบัตรไม่เพียงพอสำหรับคำสั่งซื้อนี้ ระบบส่งเรื่องให้เจ้าหน้าที่ตรวจสอบเพื่อคืนเงินเต็มจำนวน (รวมค่าบริการ)',
        caseId: recoveryCase.id,
        recoveryCase,
      };
    }

    // Check currency and amount matching
    const actualCurrency = (input.actualCurrency || charge.currency || 'thb').toLowerCase();
    if (actualCurrency !== 'thb') {
      return {
        success: false,
        orderId: order.id,
        status: 'mismatch',
        message: 'สกุลเงินที่ชำระไม่ถูกต้อง (ต้องเป็น THB)',
      };
    }

    const expectedSatang = Math.round(Number(order.total) * 100);
    const actualSatang = input.actualAmount !== undefined ? input.actualAmount : Number(charge.amount);
    if (actualSatang !== expectedSatang) {
      return {
        success: false,
        orderId: order.id,
        status: 'mismatch',
        message: `ยอดเงินที่ชำระ (${actualSatang / 100} THB) ไม่ตรงกับยอดคำสั่งซื้อ (${expectedSatang / 100} THB)`,
      };
    }

    // Success time vs deadline vs cancellation time (AC-112, AC-113, AC-114, G-50, G-51, G-52, G-35)
    // T = provider confirmed payment time
    // D = original reservation deadline
    // C = session cancellation approval time
    const paidAt = input.providerPaidAt || now;
    const deadline = new Date(order.expiresAt);
    const isCancelledSession = order.sessionStatus === 'cancelled' || !!order.cancellationApprovedAt;
    const cancelTime = order.cancellationApprovedAt
      ? new Date(order.cancellationApprovedAt)
      : (order.sessionUpdatedAt ? new Date(order.sessionUpdatedAt) : now);

    // Case 1: T > D regardless of C -> G-35 applies: full refund including customer service fee
    if (paidAt.getTime() > deadline.getTime()) {
      await client.query(
        `UPDATE payment_charges
         SET status = 'successful', "paidAt" = $2, "updatedAt" = $3
         WHERE id = $1`,
        [charge.id, paidAt, now],
      );
      await client.query(
        `UPDATE orders
         SET status = 'payment_exception', "updatedAt" = $2
         WHERE id = $1`,
        [order.id, now],
      );

      const caseId = `PRC-${randomUUID().slice(0, 8).toUpperCase()}`;
      await client.query(
        `INSERT INTO payment_recovery_cases (
           id, "orderId", "chargeId", reason, amount, "customerFee", subtotal,
           status, "providerPaidAt", "orderExpiresAt", "buyerName", "buyerEmail",
           "buyerPhone", notes, "createdAt", "updatedAt"
         )
         VALUES ($1, $2, $3, 'paid_after_deadline', $4, $5, $6, 'pending_review', $7, $8, $9, $10, $11, $12, $13, $13)`,
        [
          caseId,
          order.id,
          charge.id,
          order.total,
          order.customerFee,
          order.subtotal,
          paidAt,
          deadline,
          order.buyerName,
          order.buyerEmail,
          order.buyerPhone,
          'ชำระเงินหลังจากพ้นกำหนดเวลา 15 นาที (G-35)',
          now,
        ],
      );

      const recoveryCase: PaymentRecoveryCaseDetail = {
        id: caseId,
        orderId: order.id,
        chargeId: charge.id,
        reason: 'paid_after_deadline',
        amount: Number(order.total),
        customerFee: Number(order.customerFee),
        subtotal: Number(order.subtotal),
        status: 'pending_review',
        providerPaidAt: paidAt.toISOString(),
        orderExpiresAt: deadline.toISOString(),
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        buyerPhone: order.buyerPhone,
        notes: 'ชำระเงินหลังจากพ้นกำหนดเวลา 15 นาที (G-35)',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      return {
        success: false,
        orderId: order.id,
        status: 'paid_after_deadline',
        message: 'ชำระเงินเกินกำหนดเวลา 15 นาที ระบบไม่สามารถออกบัตรได้ และได้เปิดเคสให้เจ้าหน้าที่ตรวจสอบเพื่อคืนเงินเต็มจำนวน (รวมค่าบริการ)',
        caseId,
        recoveryCase,
      };
    }

    // Case 2: T <= D and Session is Cancelled (AC-112, AC-113, AC-114, G-50, G-51, G-52)
    // No tickets/QR are issued for a cancelled session.
    if (isCancelledSession) {
      // Subcase 2A: T <= D and T < C (G-51, AC-113)
      // Purchase succeeded before cancellation took effect -> refund ticket face value only (R5), exclude customer fee
      if (paidAt.getTime() < cancelTime.getTime()) {
        await client.query(
          `UPDATE payment_charges
           SET status = 'successful', "paidAt" = $2, "updatedAt" = $3
           WHERE id = $1`,
          [charge.id, paidAt, now],
        );
        await client.query(
          `UPDATE orders
           SET status = 'paid', "updatedAt" = $2
           WHERE id = $1`,
          [order.id, now],
        );

        const refundRequestId = `REF-${randomUUID().slice(0, 8).toUpperCase()}`;
        await client.query(
          `INSERT INTO refund_requests (
             id, "orderId", "buyerEmail", "buyerPhone", "buyerName",
             "requestedAmount", reason, status,
             "submittedAt", "reviewedAt", "reviewedByName", "createdAt", "updatedAt"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $8, $9, $8, $8)`,
          [
            refundRequestId,
            order.id,
            order.buyerEmail,
            order.buyerPhone,
            order.buyerName,
            order.subtotal,
            'รอบการแสดงถูกยกเลิก (ชำระเงินก่อนเวลายกเลิกรอบ - G-51)',
            now,
            'ระบบอัตโนมัติ (G-51)',
          ],
        );

        const liabilityId = `LIA-${randomUUID().slice(0, 8).toUpperCase()}`;
        await client.query(
          `INSERT INTO refund_liabilities (
             id, "refundRequestId", "orderId", "eventId", "sessionId",
             amount, status, "approvedAt", "createdAt"
           ) VALUES ($1, $2, $3, $4, $5, $6, 'unpaid', $7, $7)
           ON CONFLICT ("refundRequestId") DO NOTHING`,
          [liabilityId, refundRequestId, order.id, order.eventId, order.sessionId, order.subtotal, now],
        );

        return {
          success: false,
          orderId: order.id,
          status: 'cancelled_session_refund_face_value',
          message: 'รอบการแสดงถูกยกเลิก ชำระเงินก่อนเวลายกเลิกรอบ ระบบสร้างรายการคืนเงินเฉพาะราคาบัตรตามเงื่อนไข (ไม่รวมค่าบริการ)',
          refundRequestId,
          refundAmount: Number(order.subtotal),
        };
      }

      // Subcase 2B: T <= D and T >= C, including T = C (G-52, AC-114)
      // Payment occurred at or after session was cancelled -> refund full amount including customer service fee
      await client.query(
        `UPDATE payment_charges
         SET status = 'successful', "paidAt" = $2, "updatedAt" = $3
         WHERE id = $1`,
        [charge.id, paidAt, now],
      );
      await client.query(
        `UPDATE orders
         SET status = 'payment_exception', "updatedAt" = $2
         WHERE id = $1`,
        [order.id, now],
      );

      const refundRequestId = `REF-${randomUUID().slice(0, 8).toUpperCase()}`;
      await client.query(
        `INSERT INTO refund_requests (
           id, "orderId", "buyerEmail", "buyerPhone", "buyerName",
           "requestedAmount", reason, status,
           "submittedAt", "reviewedAt", "reviewedByName", "createdAt", "updatedAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $8, $9, $8, $8)`,
        [
          refundRequestId,
          order.id,
          order.buyerEmail,
          order.buyerPhone,
          order.buyerName,
          order.total,
          'รอบการแสดงถูกยกเลิก (ชำระเงินหลังเวลายกเลิกรอบ - G-52)',
          now,
          'ระบบอัตโนมัติ (G-52)',
        ],
      );

      const liabilityId = `LIA-${randomUUID().slice(0, 8).toUpperCase()}`;
      await client.query(
        `INSERT INTO refund_liabilities (
           id, "refundRequestId", "orderId", "eventId", "sessionId",
           amount, status, "approvedAt", "createdAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, 'unpaid', $7, $7)
         ON CONFLICT ("refundRequestId") DO NOTHING`,
        [liabilityId, refundRequestId, order.id, order.eventId, order.sessionId, order.total, now],
      );

      const caseId = `PRC-${randomUUID().slice(0, 8).toUpperCase()}`;
      await client.query(
        `INSERT INTO payment_recovery_cases (
           id, "orderId", "chargeId", reason, amount, "customerFee", subtotal,
           status, "providerPaidAt", "orderExpiresAt", "buyerName", "buyerEmail",
           "buyerPhone", notes, "createdAt", "updatedAt"
         )
         VALUES ($1, $2, $3, 'paid_after_cancellation', $4, $5, $6, 'pending_review', $7, $8, $9, $10, $11, $12, $13, $13)`,
        [
          caseId,
          order.id,
          charge.id,
          order.total,
          order.customerFee,
          order.subtotal,
          paidAt,
          deadline,
          order.buyerName,
          order.buyerEmail,
          order.buyerPhone,
          'ชำระเงินหลังจากหรือตรงกับเวลาที่รอบการแสดงถูกยกเลิก (G-52) คืนเต็มยอดรวมค่าบริการ',
          now,
        ],
      );

      return {
        success: false,
        orderId: order.id,
        status: 'cancelled_session_refund_full',
        message: 'รอบการแสดงถูกยกเลิกขณะหรือก่อนชำระเงิน ระบบเปิดเคสคืนเงินเต็มจำนวนรวมค่าบริการ',
        caseId,
        refundRequestId,
        refundAmount: Number(order.total),
      };
    }

    // Case 2: Timely payment (T <= D)
    // Check if reservation hold expired or quota was returned before callback arrived
    const isHoldExpired = order.status === 'expired' || now.getTime() > deadline.getTime();

    if (isHoldExpired) {
      // Re-check quota availability for all ticket types in the order (AC-72, AC-74)
      const itemsRes = await client.query(
        `SELECT id, "ticketTypeId", quantity
         FROM order_items
         WHERE "orderId" = $1`,
        [order.id],
      );

      const ticketTypeIds = itemsRes.rows.map(r => r.ticketTypeId);
      const ttRes = await client.query(
        `SELECT id, name, quota
         FROM ticket_types
         WHERE id = ANY($1)
         FOR UPDATE`,
        [ticketTypeIds],
      );

      const ttMap = new Map(ttRes.rows.map(r => [r.id, r]));
      let hasSufficientQuota = true;

      for (const item of itemsRes.rows) {
        const tt = ttMap.get(item.ticketTypeId);
        if (!tt) {
          hasSufficientQuota = false;
          break;
        }

        const heldRes = await client.query(
          `SELECT GREATEST(0,
             coalesce(sum(oi.quantity), 0)::int -
             coalesce((SELECT count(*)::int FROM tickets t WHERE t."ticketTypeId" = $1 AND t.status = 'refunded'), 0)
           )::int as held
           FROM order_items oi
           JOIN orders o ON oi."orderId" = o.id
           WHERE oi."ticketTypeId" = $1
             AND o.id != $2
             AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > $3))`,
          [item.ticketTypeId, order.id, now],
        );

        const held = Number(heldRes.rows[0]?.held) || 0;
        const availableQuota = Number(tt.quota) - held;
        if (availableQuota < item.quantity) {
          hasSufficientQuota = false;
          break;
        }
      }

      if (!hasSufficientQuota) {
        // Insufficient quota -> Do NOT fulfill partially, open owner review case for full refund (AC-74, G-23)
        await client.query(
          `UPDATE payment_charges
           SET status = 'successful', "paidAt" = $2, "updatedAt" = $3
           WHERE id = $1`,
          [charge.id, paidAt, now],
        );
        await client.query(
          `UPDATE orders
           SET status = 'payment_exception', "updatedAt" = $2
           WHERE id = $1`,
          [order.id, now],
        );

        const caseId = `PRC-${randomUUID().slice(0, 8).toUpperCase()}`;
        await client.query(
          `INSERT INTO payment_recovery_cases (
             id, "orderId", "chargeId", reason, amount, "customerFee", subtotal,
             status, "providerPaidAt", "orderExpiresAt", "buyerName", "buyerEmail",
             "buyerPhone", notes, "createdAt", "updatedAt"
           )
           VALUES ($1, $2, $3, 'insufficient_quota', $4, $5, $6, 'pending_review', $7, $8, $9, $10, $11, $12, $13, $13)`,
          [
            caseId,
            order.id,
            charge.id,
            order.total,
            order.customerFee,
            order.subtotal,
            paidAt,
            deadline,
            order.buyerName,
            order.buyerEmail,
            order.buyerPhone,
            'โควตาบัตรไม่เพียงพอขณะที่ผลชำระเงินมาถึง ระบบไม่ออกบัตรบางส่วนและเปิดเคสคืนเงินเต็มจำนวน (รวมค่าบริการ)',
            now,
          ],
        );

        const recoveryCase: PaymentRecoveryCaseDetail = {
          id: caseId,
          orderId: order.id,
          chargeId: charge.id,
          reason: 'insufficient_quota',
          amount: Number(order.total),
          customerFee: Number(order.customerFee),
          subtotal: Number(order.subtotal),
          status: 'pending_review',
          providerPaidAt: paidAt.toISOString(),
          orderExpiresAt: deadline.toISOString(),
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          buyerPhone: order.buyerPhone,
          notes: 'โควตาบัตรไม่เพียงพอขณะที่ผลชำระเงินมาถึง ระบบไม่ออกบัตรบางส่วนและเปิดเคสคืนเงินเต็มจำนวน (รวมค่าบริการ)',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        return {
          success: false,
          orderId: order.id,
          status: 'insufficient_quota',
          message: 'โควตาบัตรไม่เพียงพอสำหรับคำสั่งซื้อนี้ ระบบไม่สามารถออกบัตรบางส่วน และได้เปิดเคสให้เจ้าหน้าที่ตรวจสอบเพื่อคืนเงินเต็มจำนวน (รวมค่าบริการ)',
          caseId,
          recoveryCase,
        };
      }
    }

    // Timely payment with sufficient quota (AC-17, AC-72) -> issue tickets atomically
    await client.query(
      `UPDATE payment_charges
       SET status = 'successful', "paidAt" = $2, "updatedAt" = $3
       WHERE id = $1`,
      [charge.id, paidAt, now],
    );

    await client.query(
      `UPDATE orders
       SET status = 'paid', "updatedAt" = $2
       WHERE id = $1`,
      [order.id, now],
    );

    const tickets = await issueTicketsForOrder(client, order.id, now);

    return {
      success: true,
      orderId: order.id,
      status: 'paid',
      message: 'ชำระเงินสำเร็จ ออกบัตรคอนเสิร์ตเรียบร้อยแล้ว',
      tickets,
    };
  });

  if (result.status === 'paid' && result.tickets && result.tickets.length > 0) {
    try {
      await sendOrderTicketsEmail(pool, result.orderId, { now });
    } catch {
      // Delivery errors are tracked in ticket_email_deliveries and do not fail payment (AC-75)
    }
  }

  return result;
}

export async function listPaymentRecoveryCases(
  pool: Pool,
  filter?: { status?: string },
): Promise<PaymentRecoveryCaseDetail[]> {
  await ensurePaymentSchema(pool);
  let query = `
    SELECT id, "orderId", "chargeId", reason, amount, "customerFee", subtotal,
           status, "providerPaidAt", "orderExpiresAt", "buyerName", "buyerEmail",
           "buyerPhone", notes, "createdAt", "updatedAt"
    FROM payment_recovery_cases
  `;
  const params: unknown[] = [];
  if (filter?.status) {
    query += ' WHERE status = $1';
    params.push(filter.status);
  }
  query += ' ORDER BY "createdAt" DESC';
  const res = await pool.query(query, params);
  return res.rows.map(r => ({
    id: r.id,
    orderId: r.orderId,
    chargeId: r.chargeId,
    reason: r.reason as 'paid_after_deadline' | 'insufficient_quota',
    amount: Number(r.amount),
    customerFee: Number(r.customerFee),
    subtotal: Number(r.subtotal),
    status: r.status as 'pending_review',
    providerPaidAt: new Date(r.providerPaidAt).toISOString(),
    orderExpiresAt: new Date(r.orderExpiresAt).toISOString(),
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhone: r.buyerPhone,
    notes: r.notes || undefined,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  }));
}
