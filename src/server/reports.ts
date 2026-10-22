import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { storage } from './storage';
import {
  roundHalfUp,
  calculateOrganizerOrderFee,
  getEventFeeSettings,
  type OrganizerFeeMode,
  ensureFeeSchema,
} from './fees';

export interface MaskedBuyerContact {
  name: string;
  email: string;
  phone: string;
}

/**
 * Partially masks an email address for privacy (AC-64).
 * e.g. "alice@example.com" -> "al***@example.com"
 *      "me@example.com" -> "m***@example.com"
 */
export function maskEmail(email: string): string {
  if (!email?.includes('@')) return '***';
  const parts = email.split('@');
  const local = parts[0] || '';
  const domain = parts.slice(1).join('@');
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Partially masks a phone number for privacy (AC-64).
 * e.g. "0812345678" -> "081***5678"
 */
export function maskPhone(phone: string): string {
  if (!phone) return '***';
  const clean = phone.trim();
  if (clean.length <= 6) return '***';
  return `${clean.slice(0, 3)}***${clean.slice(-4)}`;
}

export interface CalculateEventAccountingParams {
  netSales: number; // sum(V_o)
  grossSales: number; // sum(V_o^orig)
  approvedRefunds: number; // sum(V_o^orig - V_o)
  organizerFeeMode: OrganizerFeeMode;
  organizerFeeRate: number;
  orderFeesSum: number; // sum(F_o) for percentage / per_ticket
  reservePercentage: number; // s
  totalPaidOut: number; // P
  totalDebtRepaid: number; // X
  totalReserveReleased: number; // U
}

export interface AccountingResult {
  grossSales: number;
  approvedRefundDeductions: number;
  netSales: number;
  organizerFee: number;
  organizerFeeMode: OrganizerFeeMode;
  organizerFeeRate: number;
  flatFeeCarry: number;
  netEntitlement: number;
  netLiability: number;
  debtAmount: number;
  isDebt: boolean;
  flatFeeDebt: number;
  excessPayoutRefundDebt: number;
  reservePercentage: number;
  reserveTarget: number;
  reserveOutstanding: number;
  actualHeldReserve: number;
  payableAmount: number;
  totalPaidOut: number;
}

/**
 * Pure accounting formula engine implementing SPEC-001 monetary invariants (G-26, G-27, G-28, G-29, G-30, G-33, G-48).
 */
export function calculateEventAccounting(params: CalculateEventAccountingParams): AccountingResult {
  const {
    netSales,
    grossSales,
    approvedRefunds,
    organizerFeeMode,
    organizerFeeRate,
    orderFeesSum,
    reservePercentage,
    totalPaidOut,
    totalDebtRepaid,
    totalReserveReleased,
  } = params;

  let organizerFee = 0;
  let flatFeeCarry = 0;

  if (organizerFeeMode === 'flat_fee') {
    // Flat fee assessed once for the whole event (G-27, G-29, AC-81)
    organizerFee = roundHalfUp(organizerFeeRate);
    flatFeeCarry = Math.max(0, roundHalfUp(organizerFee - netSales));
  } else {
    organizerFee = roundHalfUp(orderFeesSum);
  }

  // E = sum(V_o) - F
  const netEntitlement = roundHalfUp(netSales - organizerFee);

  // L = E - P + X
  const netLiability = roundHalfUp(netEntitlement - totalPaidOut + totalDebtRepaid);
  const isDebt = netLiability < 0;
  const debtAmount = isDebt ? Math.abs(netLiability) : 0;

  // Reserve target = R(max(E, 0) * s / 100) (G-30)
  const reserveTarget = roundHalfUp((Math.max(0, netEntitlement) * reservePercentage) / 100);

  // Reserve outstanding = max(0, Reserve target - U)
  const reserveOutstanding = Math.max(0, roundHalfUp(reserveTarget - totalReserveReleased));

  // Actual held reserve H = min(Reserve outstanding, max(L, 0))
  const actualHeldReserve = Math.min(reserveOutstanding, Math.max(0, netLiability));

  // Payable amount = max(0, L - H)
  const payableAmount = Math.max(0, roundHalfUp(netLiability - actualHeldReserve));

  // Debt reasons breakdown (G-33, AC-85, AC-86)
  let flatFeeDebt = 0;
  let excessPayoutRefundDebt = 0;
  if (isDebt) {
    if (organizerFeeMode === 'flat_fee' && flatFeeCarry > 0) {
      flatFeeDebt = Math.min(debtAmount, flatFeeCarry);
      excessPayoutRefundDebt = roundHalfUp(debtAmount - flatFeeDebt);
    } else {
      excessPayoutRefundDebt = debtAmount;
    }
  }

  return {
    grossSales: roundHalfUp(grossSales),
    approvedRefundDeductions: roundHalfUp(approvedRefunds),
    netSales: roundHalfUp(netSales),
    organizerFee,
    organizerFeeMode,
    organizerFeeRate,
    flatFeeCarry,
    netEntitlement,
    netLiability,
    debtAmount,
    isDebt,
    flatFeeDebt,
    excessPayoutRefundDebt,
    reservePercentage,
    reserveTarget,
    reserveOutstanding,
    actualHeldReserve,
    payableAmount,
    totalPaidOut: roundHalfUp(totalPaidOut),
  };
}

export interface OrderMoneyItem {
  orderId: string;
  sessionId: string;
  buyerName: string;
  buyerEmail: string; // masked for organizer, raw for owner
  buyerPhone: string; // masked for organizer, raw for owner
  createdAt: string;
  totalTicketsCount: number;
  validTicketsCount: number;
  refundedTicketsCount: number;
  grossSubtotal: number; // V_o^orig
  refundDeductions: number; // R_o
  netSubtotal: number; // V_o
  orderFeeOriginal: number; // F_o^orig
  orderFeeAdjusted: number; // F_o
  feeAdjustment: number; // Delta F_o = F_o^orig - F_o
}

export interface SessionMoneySummary {
  sessionId: string;
  sessionStartTime: string;
  sessionEndTime: string;
  sessionStatus: string;
  issuedTicketsCount: number;
  validTicketsCount: number;
  refundedTicketsCount: number;
  grossSales: number;
  approvedRefunds: number;
  netSales: number;
}

export interface PayoutHistoryItem {
  id: string;
  eventId: string;
  amount: number;
  status: 'completed' | 'failed';
  paidAt: string;
  transferProofKey: string | null;
  transferProofUrl: string | null;
  transferNote: string | null;
  transferFailureReason: string | null;
  transferFailedAt: string | null;
  recordedByName: string | null;
  createdAt: string;
}

export interface ReserveReleaseItem {
  id: string;
  eventId: string;
  amount: number;
  releasedAt: string;
  notes: string | null;
  recordedByName: string | null;
  createdAt: string;
}

export interface DebtRepaymentItem {
  id: string;
  eventId: string;
  amount: number;
  repaidAt: string;
  notes: string | null;
  recordedByName: string | null;
  createdAt: string;
}

export interface EventMoneyReportDetail extends AccountingResult {
  eventId: string;
  eventTitle: string;
  organizerId: string;
  organizerName: string;
  totalPaidOut: number;
  totalDebtRepaid: number;
  totalReserveReleased: number;
  totalOrdersCount: number;
  totalTicketsIssuedCount: number;
  totalTicketsValidCount: number;
  totalTicketsRefundedCount: number;
  finalSessionEnd: string | null;
  isFinalSessionEnded: boolean;
  sessions: SessionMoneySummary[];
  orders: OrderMoneyItem[];
  payouts: PayoutHistoryItem[];
  reserveReleases: ReserveReleaseItem[];
  repayments: DebtRepaymentItem[];
}

export async function ensureReportSchema(pool: Pool): Promise<void> {
  await ensureFeeSchema(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_payouts (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      "paidAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "transferProofKey" TEXT,
      "transferProofUrl" TEXT,
      "transferNote" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "recordedBy" TEXT REFERENCES auth_user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_event_payouts_eventId ON event_payouts("eventId");

    ALTER TABLE event_payouts ADD COLUMN IF NOT EXISTS "transferFailureReason" TEXT;
    ALTER TABLE event_payouts ADD COLUMN IF NOT EXISTS "transferFailedAt" TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS event_debt_repayments (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL,
      "repaidAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      notes TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "recordedBy" TEXT REFERENCES auth_user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_event_debt_repayments_eventId ON event_debt_repayments("eventId");

    CREATE TABLE IF NOT EXISTS event_reserve_releases (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL,
      "releasedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      notes TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "recordedBy" TEXT REFERENCES auth_user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_event_reserve_releases_eventId ON event_reserve_releases("eventId");
  `);
}

export interface ActorContext {
  id: string;
  role: 'owner' | 'organizer' | 'scanner';
}

/**
 * Generates the full Event Money Report with access control and privacy masking (AC-28, AC-64, AC-77, AC-78, AC-80, AC-81, AC-82, AC-110, AC-84).
 */
export async function getEventMoneyReport(
  pool: Pool,
  eventId: string,
  actor: ActorContext,
): Promise<EventMoneyReportDetail> {
  await ensureReportSchema(pool);

  // 1. Role enforcement (AC-82): Scanners are strictly rejected
  if (actor.role === 'scanner') {
    throw new Error('ไม่อนุญาต: ทีมสแกนไม่มีสิทธิ์เข้าถึงรายงานการเงิน (AC-82)');
  }

  // 2. Fetch event and verify organizer ownership (AC-07, AC-82)
  const eventRes = await pool.query<{
    id: string;
    title: string;
    organizerId: string;
    organizerName: string;
  }>(
    `SELECT e.id, e.title, e."organizerId", u.name AS "organizerName"
     FROM events e
     JOIN auth_user u ON u.id = e."organizerId"
     WHERE e.id = $1`,
    [eventId],
  );

  if (eventRes.rowCount === 0) {
    throw new Error('ไม่พบข้อมูลคอนเสิร์ตที่ระบุ');
  }

  const event = eventRes.rows[0];

  if (actor.role === 'organizer' && event.organizerId !== actor.id) {
    throw new Error('ไม่อนุญาต: ผู้จัดงานสามารถเข้าถึงรายงานได้เฉพาะงานของตนเองเท่านั้น (AC-07, AC-82)');
  }

  const isOrganizerActor = actor.role === 'organizer';

  // 3. Fee settings
  const feeSettings = await getEventFeeSettings(pool, eventId);

  // 4. Query all issued tickets for this event by order
  // Note: Only tickets actually issued in tickets table are counted (AC-84).
  // Unissued cancellation/late refund cases from TASK-027 have 0 tickets and never enter here.
  const ticketsRes = await pool.query<{
    ticketId: string;
    orderId: string;
    sessionId: string;
    ticketTypeId: string;
    unitPrice: number;
    status: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string;
    orderCreatedAt: Date;
  }>(
    `SELECT t.id AS "ticketId", t."orderId", t."sessionId", t."ticketTypeId",
            tt.price AS "unitPrice", t.status,
            o."buyerName", o."buyerEmail", o."buyerPhone", o."createdAt" AS "orderCreatedAt"
     FROM tickets t
     JOIN ticket_types tt ON tt.id = t."ticketTypeId"
     JOIN orders o ON o.id = t."orderId"
     WHERE o."eventId" = $1
     ORDER BY o."createdAt" ASC, t.id ASC`,
    [eventId],
  );

  // Group tickets by order
  interface OrderTicketGroup {
    orderId: string;
    sessionId: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string;
    orderCreatedAt: Date;
    tickets: typeof ticketsRes.rows;
  }

  const orderGroups = new Map<string, OrderTicketGroup>();
  for (const t of ticketsRes.rows) {
    const existing = orderGroups.get(t.orderId) || {
      orderId: t.orderId,
      sessionId: t.sessionId,
      buyerName: t.buyerName,
      buyerEmail: t.buyerEmail,
      buyerPhone: t.buyerPhone,
      orderCreatedAt: t.orderCreatedAt,
      tickets: [],
    };
    existing.tickets.push(t);
    orderGroups.set(t.orderId, existing);
  }

  let totalGrossSales = 0;
  let totalApprovedRefunds = 0;
  let totalNetSales = 0;
  let totalOrderFeesSum = 0;
  let totalTicketsIssued = 0;
  let totalTicketsValid = 0;
  let totalTicketsRefunded = 0;

  const ordersList: OrderMoneyItem[] = [];

  for (const [orderId, group] of orderGroups.entries()) {
    const totalCount = group.tickets.length;
    const validTickets = group.tickets.filter(t => t.status === 'valid');
    const validCount = validTickets.length;
    const refundedCount = totalCount - validCount;

    const grossSubtotal = roundHalfUp(group.tickets.reduce((sum, t) => sum + Number(t.unitPrice), 0));
    const netSubtotal = roundHalfUp(validTickets.reduce((sum, t) => sum + Number(t.unitPrice), 0));
    const refundDeductions = roundHalfUp(grossSubtotal - netSubtotal);

    // Calculate original and adjusted order fee (AC-78, AC-80, G-28, G-48)
    const orderFeeOriginal = calculateOrganizerOrderFee(
      feeSettings.organizerFeeMode,
      feeSettings.organizerFeeRate,
      totalCount,
      grossSubtotal,
    );
    const orderFeeAdjusted = calculateOrganizerOrderFee(
      feeSettings.organizerFeeMode,
      feeSettings.organizerFeeRate,
      validCount,
      netSubtotal,
    );
    const feeAdjustment = roundHalfUp(orderFeeOriginal - orderFeeAdjusted);

    totalGrossSales = roundHalfUp(totalGrossSales + grossSubtotal);
    totalApprovedRefunds = roundHalfUp(totalApprovedRefunds + refundDeductions);
    totalNetSales = roundHalfUp(totalNetSales + netSubtotal);
    totalOrderFeesSum = roundHalfUp(totalOrderFeesSum + orderFeeAdjusted);

    totalTicketsIssued += totalCount;
    totalTicketsValid += validCount;
    totalTicketsRefunded += refundedCount;

    ordersList.push({
      orderId,
      sessionId: group.sessionId,
      buyerName: group.buyerName,
      buyerEmail: isOrganizerActor ? maskEmail(group.buyerEmail) : group.buyerEmail,
      buyerPhone: isOrganizerActor ? maskPhone(group.buyerPhone) : group.buyerPhone,
      createdAt: group.orderCreatedAt.toISOString(),
      totalTicketsCount: totalCount,
      validTicketsCount: validCount,
      refundedTicketsCount: refundedCount,
      grossSubtotal,
      refundDeductions,
      netSubtotal,
      orderFeeOriginal,
      orderFeeAdjusted,
      feeAdjustment,
    });
  }

  // 5. Query sessions for session breakdown
  const sessRes = await pool.query<{
    id: string;
    startTime: Date;
    endTime: Date;
    status: string;
  }>(
    `SELECT id, "startTime", "endTime", status
     FROM event_sessions
     WHERE "eventId" = $1
     ORDER BY "startTime" ASC`,
    [eventId],
  );

  const sessionMap = new Map<string, SessionMoneySummary>();
  for (const s of sessRes.rows) {
    sessionMap.set(s.id, {
      sessionId: s.id,
      sessionStartTime: s.startTime.toISOString(),
      sessionEndTime: s.endTime.toISOString(),
      sessionStatus: s.status,
      issuedTicketsCount: 0,
      validTicketsCount: 0,
      refundedTicketsCount: 0,
      grossSales: 0,
      approvedRefunds: 0,
      netSales: 0,
    });
  }

  for (const o of ordersList) {
    const s = sessionMap.get(o.sessionId);
    if (s) {
      s.issuedTicketsCount += o.totalTicketsCount;
      s.validTicketsCount += o.validTicketsCount;
      s.refundedTicketsCount += o.refundedTicketsCount;
      s.grossSales = roundHalfUp(s.grossSales + o.grossSubtotal);
      s.approvedRefunds = roundHalfUp(s.approvedRefunds + o.refundDeductions);
      s.netSales = roundHalfUp(s.netSales + o.netSubtotal);
    }
  }

  // 6. Query payouts (P), debt repayments (X), and reserve releases (U)
  const payoutsRes = await pool.query<{ totalPaid: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS "totalPaid"
     FROM event_payouts
     WHERE "eventId" = $1 AND status = 'completed'`,
    [eventId],
  );
  const totalPaidOut = roundHalfUp(Number(payoutsRes.rows[0]?.totalPaid || 0));

  const debtRes = await pool.query<{ totalDebtRepaid: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS "totalDebtRepaid"
     FROM event_debt_repayments
     WHERE "eventId" = $1`,
    [eventId],
  );
  const totalDebtRepaid = roundHalfUp(Number(debtRes.rows[0]?.totalDebtRepaid || 0));

  const reserveRelRes = await pool.query<{ totalReleased: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS "totalReleased"
     FROM event_reserve_releases
     WHERE "eventId" = $1`,
    [eventId],
  );
  const totalReserveReleased = roundHalfUp(Number(reserveRelRes.rows[0]?.totalReleased || 0));

  // 7. Query payout history (AC-31, AC-92)
  const payoutsListRes = await pool.query<{
    id: string;
    eventId: string;
    amount: string;
    status: 'completed' | 'failed';
    paidAt: Date;
    transferProofKey: string | null;
    transferProofUrl: string | null;
    transferNote: string | null;
    transferFailureReason: string | null;
    transferFailedAt: Date | null;
    recordedByName: string | null;
    createdAt: Date;
  }>(
    `SELECT ep.id, ep."eventId", ep.amount::text, ep.status, ep."paidAt",
            ep."transferProofKey", ep."transferProofUrl", ep."transferNote",
            ep."transferFailureReason", ep."transferFailedAt",
            u.name AS "recordedByName", ep."createdAt"
     FROM event_payouts ep
     LEFT JOIN auth_user u ON u.id = ep."recordedBy"
     WHERE ep."eventId" = $1
     ORDER BY ep."paidAt" DESC, ep."createdAt" DESC`,
    [eventId],
  );

  const isOwner = actor.role === 'owner';
  const payouts: PayoutHistoryItem[] = payoutsListRes.rows.map(p => ({
    id: p.id,
    eventId: p.eventId,
    amount: roundHalfUp(Number(p.amount)),
    status: p.status,
    paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : String(p.paidAt),
    // AC-31, AC-92: Organizer CANNOT see transferProofKey or transferProofUrl
    transferProofKey: isOwner ? p.transferProofKey : null,
    transferProofUrl: isOwner ? p.transferProofUrl : null,
    transferNote: p.transferNote,
    transferFailureReason: p.transferFailureReason,
    transferFailedAt:
      p.transferFailedAt instanceof Date
        ? p.transferFailedAt.toISOString()
        : p.transferFailedAt
          ? String(p.transferFailedAt)
          : null,
    recordedByName: p.recordedByName,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
  }));

  // 8. Query reserve releases history
  const releasesListRes = await pool.query<{
    id: string;
    eventId: string;
    amount: string;
    releasedAt: Date;
    notes: string | null;
    recordedByName: string | null;
    createdAt: Date;
  }>(
    `SELECT rr.id, rr."eventId", rr.amount::text, rr."releasedAt",
            rr.notes, u.name AS "recordedByName", rr."createdAt"
     FROM event_reserve_releases rr
     LEFT JOIN auth_user u ON u.id = rr."recordedBy"
     WHERE rr."eventId" = $1
     ORDER BY rr."releasedAt" DESC, rr."createdAt" DESC`,
    [eventId],
  );

  const reserveReleases: ReserveReleaseItem[] = releasesListRes.rows.map(r => ({
    id: r.id,
    eventId: r.eventId,
    amount: roundHalfUp(Number(r.amount)),
    releasedAt: r.releasedAt instanceof Date ? r.releasedAt.toISOString() : String(r.releasedAt),
    notes: r.notes,
    recordedByName: r.recordedByName,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  // 9. Query debt repayments history (AC-86)
  const repaymentsListRes = await pool.query<{
    id: string;
    eventId: string;
    amount: string;
    repaidAt: Date;
    notes: string | null;
    recordedByName: string | null;
    createdAt: Date;
  }>(
    `SELECT dr.id, dr."eventId", dr.amount::text, dr."repaidAt",
            dr.notes, u.name AS "recordedByName", dr."createdAt"
     FROM event_debt_repayments dr
     LEFT JOIN auth_user u ON u.id = dr."recordedBy"
     WHERE dr."eventId" = $1
     ORDER BY dr."repaidAt" DESC, dr."createdAt" DESC`,
    [eventId],
  );

  const repayments: DebtRepaymentItem[] = repaymentsListRes.rows.map(r => ({
    id: r.id,
    eventId: r.eventId,
    amount: roundHalfUp(Number(r.amount)),
    repaidAt: r.repaidAt instanceof Date ? r.repaidAt.toISOString() : String(r.repaidAt),
    notes: r.notes,
    recordedByName: r.recordedByName,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  // Determine final session end from non-cancelled sessions (or all sessions if none non-cancelled)
  const activeSessions = sessRes.rows.filter(s => s.status !== 'cancelled');
  const candidateSessions = activeSessions.length > 0 ? activeSessions : sessRes.rows;
  let finalSessionEndDate: Date | null = null;
  for (const s of candidateSessions) {
    const end = s.endTime instanceof Date ? s.endTime : new Date(s.endTime);
    if (!finalSessionEndDate || end.getTime() > finalSessionEndDate.getTime()) {
      finalSessionEndDate = end;
    }
  }
  const now = new Date();
  const isFinalSessionEnded = finalSessionEndDate ? now.getTime() >= finalSessionEndDate.getTime() : false;
  const finalSessionEnd = finalSessionEndDate ? finalSessionEndDate.toISOString() : null;

  // 9. Calculate overall accounting
  const accounting = calculateEventAccounting({
    netSales: totalNetSales,
    grossSales: totalGrossSales,
    approvedRefunds: totalApprovedRefunds,
    organizerFeeMode: feeSettings.organizerFeeMode,
    organizerFeeRate: feeSettings.organizerFeeRate,
    orderFeesSum: totalOrderFeesSum,
    reservePercentage: feeSettings.reservePercentage,
    totalPaidOut,
    totalDebtRepaid,
    totalReserveReleased,
  });

  return {
    ...accounting,
    eventId: event.id,
    eventTitle: event.title,
    organizerId: event.organizerId,
    organizerName: event.organizerName,
    totalPaidOut,
    totalDebtRepaid,
    totalReserveReleased,
    totalOrdersCount: ordersList.length,
    totalTicketsIssuedCount: totalTicketsIssued,
    totalTicketsValidCount: totalTicketsValid,
    totalTicketsRefundedCount: totalTicketsRefunded,
    finalSessionEnd,
    isFinalSessionEnded,
    sessions: Array.from(sessionMap.values()),
    orders: ordersList,
    payouts,
    reserveReleases,
    repayments,
  };
}

export interface RecordPayoutInput {
  eventId: string;
  amount: number;
  status?: 'completed' | 'failed';
  paidAt?: Date;
  transferProofKey?: string;
  transferProofUrl?: string;
  transferNote?: string;
  transferFailureReason?: string;
  recordedBy?: string;
  actorRole?: string;
  now?: Date;
}

export interface RecordPayoutResult {
  success: boolean;
  payoutId?: string;
  status?: 'completed' | 'failed';
  amount?: number;
  payableAmount?: number;
  error?: string;
  code?: string;
}

/**
 * Record weekly manual payout or payout failure (AC-27, AC-30, AC-79, AC-87, AC-92, AC-93).
 */
export async function recordEventPayout(
  pool: Pool,
  input: RecordPayoutInput,
): Promise<RecordPayoutResult> {
  await ensureReportSchema(pool);

  // AC-27: Only owner can record payout
  const role = input.actorRole || 'owner';
  if (role !== 'owner') {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์บันทึกการโอนเงินให้ผู้จัดงาน (AC-27)',
    };
  }

  const status = input.status || 'completed';
  const amount = roundHalfUp(Number(input.amount || 0));

  if (amount <= 0) {
    return {
      success: false,
      code: 'INVALID_AMOUNT',
      error: 'จำนวนเงินที่บันทึกโอนต้องมากกว่า 0 บาท',
    };
  }

  // 1. Concurrency / duplicate submission protection (AC-87)
  // Check if an identical completed payout was submitted in the last 15 seconds
  if (status === 'completed') {
    const recentDup = await pool.query<{ id: string; amount: string }>(
      `SELECT id, amount::text
       FROM event_payouts
       WHERE "eventId" = $1 AND amount = $2 AND status = 'completed' AND "paidAt" >= now() - INTERVAL '15 seconds'`,
      [input.eventId, amount],
    );

    if (recentDup.rowCount && recentDup.rowCount > 0) {
      const report = await getEventMoneyReport(pool, input.eventId, { id: input.recordedBy || '', role: 'owner' });
      return {
        success: true,
        payoutId: recentDup.rows[0].id,
        status: 'completed',
        amount,
        payableAmount: report.payableAmount,
      };
    }
  }

  // 2. For completed payouts, verify current payable readiness before insert (AC-27, AC-30, AC-79)
  if (status === 'completed') {
    const currentReport = await getEventMoneyReport(pool, input.eventId, { id: input.recordedBy || '', role: 'owner' });
    if (currentReport.payableAmount <= 0) {
      return {
        success: false,
        code: 'CANNOT_PAY_ZERO_PAYABLE',
        error: 'ไม่มียอดพร้อมจ่าย (Payable = 0) สำหรับคอนเสิร์ตนี้ ไม่สามารถโอนจ่ายได้ (AC-79)',
      };
    }

    if (amount > currentReport.payableAmount) {
      return {
        success: false,
        code: 'EXCEEDS_PAYABLE_AMOUNT',
        error: `ยอดเงินที่บันทึก (฿${amount.toLocaleString('th-TH')}) เกินกว่ายอดพร้อมจ่ายในปัจจุบัน (฿${currentReport.payableAmount.toLocaleString('th-TH')})`,
      };
    }
  }

  // 3. Insert payout record
  const id = `PO-${randomUUID().slice(0, 8).toUpperCase()}`;
  const paidAt = input.paidAt || input.now || new Date();
  const failedAt = status === 'failed' ? (input.now || new Date()) : null;

  await pool.query(
    `INSERT INTO event_payouts (
       id, "eventId", amount, status, "paidAt",
       "transferProofKey", "transferProofUrl", "transferNote",
       "transferFailureReason", "transferFailedAt", "recordedBy",
       "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())`,
    [
      id,
      input.eventId,
      amount,
      status,
      paidAt,
      input.transferProofKey || null,
      input.transferProofUrl || null,
      input.transferNote?.trim() || null,
      input.transferFailureReason?.trim() || null,
      failedAt,
      input.recordedBy || null,
    ],
  );

  const updatedReport = await getEventMoneyReport(pool, input.eventId, { id: input.recordedBy || '', role: 'owner' });

  return {
    success: true,
    payoutId: id,
    status,
    amount,
    payableAmount: updatedReport.payableAmount,
  };
}

/**
 * Retrieve payout proof file (AC-92).
 * Strictly enforced: Only owner can download or access payout proof files.
 */
export async function getPayoutProof(
  pool: Pool,
  input: {
    payoutId: string;
    actorRole: string;
  },
): Promise<{
  success: boolean;
  data?: Buffer;
  contentType?: string;
  error?: string;
  code?: string;
}> {
  // AC-92: Only owner can access proof files
  if (input.actorRole !== 'owner') {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์เข้าถึงไฟล์หลักฐานการโอนเงิน (AC-92)',
    };
  }

  await ensureReportSchema(pool);
  const res = await pool.query<{
    id: string;
    transferProofKey: string | null;
  }>(
    `SELECT id, "transferProofKey" FROM event_payouts WHERE id = $1`,
    [input.payoutId],
  );

  if (res.rowCount === 0 || !res.rows[0].transferProofKey) {
    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'ไม่พบไฟล์หลักฐานการโอนเงินของรายการนี้',
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

export interface RecordDebtRepaymentInput {
  eventId: string;
  amount: number;
  repaidAt?: Date;
  notes?: string;
  recordedBy?: string;
  actorRole?: string;
  now?: Date;
}

export interface RecordDebtRepaymentResult {
  success: boolean;
  repaymentId?: string;
  amount?: number;
  alreadyRecorded?: boolean;
  code?: string;
  error?: string;
  remainingDebt?: number;
  newLiability?: number;
  newPayableAmount?: number;
}

export async function recordEventDebtRepayment(
  pool: Pool,
  input: RecordDebtRepaymentInput,
): Promise<RecordDebtRepaymentResult> {
  await ensureReportSchema(pool);

  // 1. Role enforcement: Only owner is authorized to record debt repayments (AC-86)
  if (input.actorRole && input.actorRole !== 'owner') {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: 'เฉพาะเจ้าของระบบ (Owner) เท่านั้นที่สามารถบันทึกรับเงินคืนจากผู้จัดงานได้',
    };
  }

  const numAmount = roundHalfUp(input.amount);
  if (Number.isNaN(numAmount) || numAmount <= 0) {
    return {
      success: false,
      code: 'INVALID_AMOUNT',
      error: 'กรุณาระบุจำนวนเงินที่ถูกต้องและมากกว่า 0',
    };
  }

  const checkTime = input.now || new Date();

  // 2. 15-second duplicate check (G-39, AC-86 idempotency)
  const dupCheck = await pool.query<{ id: string; amount: string }>(
    `SELECT id, amount::text
     FROM event_debt_repayments
     WHERE "eventId" = $1
       AND ABS(amount - $2) < 0.001
       AND "createdAt" >= ($3::timestamptz - interval '15 seconds')
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [input.eventId, numAmount, checkTime],
  );

  if (dupCheck.rows.length > 0) {
    const existing = dupCheck.rows[0];
    const currentReport = await getEventMoneyReport(pool, input.eventId, { id: input.recordedBy || 'system', role: 'owner' });
    return {
      success: true,
      repaymentId: existing.id,
      amount: roundHalfUp(Number(existing.amount)),
      alreadyRecorded: true,
      remainingDebt: currentReport.debtAmount,
      newLiability: currentReport.netLiability,
      newPayableAmount: currentReport.payableAmount,
    };
  }

  // 3. Inspect current accounting before recording
  const reportBefore = await getEventMoneyReport(pool, input.eventId, { id: input.recordedBy || 'system', role: 'owner' });
  if (!reportBefore.isDebt || reportBefore.debtAmount <= 0) {
    return {
      success: false,
      code: 'NO_DEBT_TO_REPAY',
      error: 'คอนเสิร์ตนี้ไม่มียอดหนี้ค้างชำระที่ต้องรับคืน',
    };
  }

  if (numAmount > reportBefore.debtAmount) {
    return {
      success: false,
      code: 'AMOUNT_EXCEEDS_DEBT',
      error: `จำนวนเงินที่ระบุ (฿${numAmount.toFixed(2)}) เกินยอดหนี้ค้างชำระ (฿${reportBefore.debtAmount.toFixed(2)})`,
    };
  }

  // 4. Insert debt repayment record
  const id = `DR-${randomUUID().slice(0, 8).toUpperCase()}`;
  await pool.query(
    `INSERT INTO event_debt_repayments (
       id, "eventId", amount, "repaidAt", notes, "recordedBy", "createdAt"
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.eventId,
      numAmount,
      input.repaidAt || checkTime,
      input.notes || null,
      input.recordedBy || null,
      checkTime,
    ],
  );

  // 5. Return updated accounting
  const updatedReport = await getEventMoneyReport(pool, input.eventId, { id: input.recordedBy || 'system', role: 'owner' });

  return {
    success: true,
    repaymentId: id,
    amount: numAmount,
    remainingDebt: updatedReport.debtAmount,
    newLiability: updatedReport.netLiability,
    newPayableAmount: updatedReport.payableAmount,
  };
}

export interface RecordReserveReleaseInput {
  eventId: string;
  amount?: number;
  releasedAt?: Date;
  notes?: string;
  recordedBy?: string;
  actorRole?: string;
  now?: Date;
}

export interface RecordReserveReleaseResult {
  success: boolean;
  releaseId?: string;
  amount?: number;
  remainingHeldReserve?: number;
  newPayableAmount?: number;
  alreadyReleased?: boolean;
  error?: string;
  code?: string;
}

/**
 * Record owner reserve release after final session ends (AC-83, G-31).
 */
export async function recordEventReserveRelease(
  pool: Pool,
  input: RecordReserveReleaseInput,
): Promise<RecordReserveReleaseResult> {
  await ensureReportSchema(pool);

  // 1. Role enforcement: Only owner can release reserve (AC-83)
  const role = input.actorRole || 'owner';
  if (role !== 'owner') {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์สั่งปล่อยเงินสำรอง (AC-83)',
    };
  }

  const nowTime = input.now || new Date();

  // 2. 15-second duplicate submission window check
  const recentRes = await pool.query<{
    id: string;
    amount: string;
    releasedAt: Date;
  }>(
    `SELECT id, amount::text, "releasedAt"
     FROM event_reserve_releases
     WHERE "eventId" = $1 AND "releasedAt" >= $2
     ORDER BY "releasedAt" DESC
     LIMIT 1`,
    [input.eventId, new Date(nowTime.getTime() - 15000)],
  );

  if (recentRes.rows.length > 0) {
    const existing = recentRes.rows[0];
    const existingAmount = roundHalfUp(Number(existing.amount));
    // If input amount matches or is omitted, return existing release idempotently
    if (!input.amount || Math.abs(roundHalfUp(input.amount) - existingAmount) < 0.01) {
      const currentReport = await getEventMoneyReport(pool, input.eventId, {
        id: input.recordedBy || 'system',
        role: 'owner',
      });
      return {
        success: true,
        releaseId: existing.id,
        amount: existingAmount,
        remainingHeldReserve: currentReport.actualHeldReserve,
        newPayableAmount: currentReport.payableAmount,
        alreadyReleased: true,
      };
    }
  }

  // 3. Final session end check (AC-83, G-31)
  const sessRes = await pool.query<{
    id: string;
    endTime: Date;
    status: string;
  }>(
    `SELECT id, "endTime", status
     FROM event_sessions
     WHERE "eventId" = $1
     ORDER BY "endTime" DESC`,
    [input.eventId],
  );

  if (sessRes.rows.length === 0) {
    return {
      success: false,
      code: 'NO_ACTIVE_SESSIONS',
      error: 'ไม่พบรอบคอนเสิร์ตของงานนี้',
    };
  }

  const nonCancelledSessions = sessRes.rows.filter(s => s.status !== 'cancelled');
  const relevantSessions = nonCancelledSessions.length > 0 ? nonCancelledSessions : sessRes.rows;
  let maxEndTime: Date | null = null;
  for (const s of relevantSessions) {
    const end = s.endTime instanceof Date ? s.endTime : new Date(s.endTime);
    if (!maxEndTime || end.getTime() > maxEndTime.getTime()) {
      maxEndTime = end;
    }
  }

  if (maxEndTime && nowTime.getTime() < maxEndTime.getTime()) {
    return {
      success: false,
      code: 'CANNOT_RELEASE_BEFORE_FINAL_SESSION_END',
      error: 'ไม่สามารถปล่อยเงินสำรองได้ก่อนรอบสุดท้ายของคอนเสิร์ตจะสิ้นสุดลง (AC-83)',
    };
  }

  // 4. Retrieve current accounting and validate held reserve
  const report = await getEventMoneyReport(pool, input.eventId, {
    id: input.recordedBy || 'system',
    role: 'owner',
  });

  const held = report.actualHeldReserve;
  if (held <= 0) {
    return {
      success: false,
      code: 'NO_RESERVE_TO_RELEASE',
      error: 'ไม่มีเงินสำรองที่กันไว้จริงให้ปล่อย (฿0.00)',
    };
  }

  const releaseAmount =
    input.amount !== undefined && input.amount > 0 ? roundHalfUp(input.amount) : held;

  if (releaseAmount <= 0) {
    return {
      success: false,
      code: 'INVALID_AMOUNT',
      error: 'ยอดเงินที่ปล่อยต้องมากกว่า 0',
    };
  }

  if (releaseAmount > held) {
    return {
      success: false,
      code: 'AMOUNT_EXCEEDS_HELD_RESERVE',
      error: `ยอดเงินที่ต้องการปล่อย (฿${releaseAmount.toFixed(2)}) เกินกว่าเงินสำรองที่กันไว้จริง (฿${held.toFixed(2)})`,
    };
  }

  // 5. Insert reserve release record
  const id = `RR-${randomUUID().slice(0, 8).toUpperCase()}`;
  const releasedAt = input.releasedAt || nowTime;

  await pool.query(
    `INSERT INTO event_reserve_releases (
       id, "eventId", amount, "releasedAt", notes, "recordedBy"
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      input.eventId,
      releaseAmount,
      releasedAt,
      input.notes || null,
      input.recordedBy || null,
    ],
  );

  // 6. Recalculate accounting to report updated payable and remaining held reserve
  const updatedReport = await getEventMoneyReport(pool, input.eventId, {
    id: input.recordedBy || 'system',
    role: 'owner',
  });

  return {
    success: true,
    releaseId: id,
    amount: releaseAmount,
    remainingHeldReserve: updatedReport.actualHeldReserve,
    newPayableAmount: updatedReport.payableAmount,
  };
}
