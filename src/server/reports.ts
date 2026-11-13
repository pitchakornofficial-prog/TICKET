import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from './database.ts';
import { storage } from './storage.ts';
import { ensureTicketSchema } from './tickets.ts';
import { validateTransferProof } from './proof-validation.ts';
import {
  roundHalfUp,
  type OrganizerFeeMode,
  ensureFeeSchema,
} from './fees.ts';

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

export interface OrdersPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface GetEventMoneyReportOptions {
  includeOrders?: boolean;
  ordersPage?: number;
  ordersLimit?: number;
}

export interface EventFinanceSummaryItem extends AccountingResult {
  eventId: string;
  eventTitle: string;
  location: string;
  status: string;
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  payoutBankName: string;
  payoutAccountNumber: string;
  payoutAccountName: string;
  firstSessionStartTime: string | null;
  finalSessionEnd: string | null;
  isFinalSessionEnded: boolean;
  totalPaidOut: number;
  totalDebtRepaid: number;
  totalReserveReleased: number;
  totalOrdersCount: number;
  totalTicketsIssuedCount: number;
  totalTicketsValidCount: number;
  totalTicketsRefundedCount: number;
  validTicketsCount: number;
  payouts: PayoutHistoryItem[];
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
  ordersPagination?: OrdersPagination;
  payouts: PayoutHistoryItem[];
  reserveReleases: ReserveReleaseItem[];
  repayments: DebtRepaymentItem[];
}

const reportSchemaInitialization = new WeakMap<Pool, Promise<void>>();

export function ensureReportSchema(pool: Pool): Promise<void> {
  const existing = reportSchemaInitialization.get(pool);
  if (existing) return existing;
  const pending = initializeReportSchema(pool).catch(error => {
    reportSchemaInitialization.delete(pool);
    throw error;
  });
  reportSchemaInitialization.set(pool, pending);
  return pending;
}

async function initializeReportSchema(pool: Pool): Promise<void> {
  await ensureFeeSchema(pool);
  await ensureTicketSchema(pool);
  await inTransaction(pool, async client => {
    // All processes/pools use one lock before taking report DDL locks.
    await client.query('SELECT pg_advisory_xact_lock($1)', [945162028]);
    await client.query(`
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
  });
}

export interface ActorContext {
  id: string;
  role: 'owner' | 'organizer' | 'scanner';
}

const ORDER_FEES_CTE = `
  WITH event_fee_cfg AS (
    SELECT e.id AS "eventId",
           COALESCE(f."organizerFeeMode", 'percentage') AS "defaultFeeMode",
           COALESCE(f."organizerFeeRate", 0)::numeric AS "defaultFeeRate",
           COALESCE(f."organizerFeePrivilegeRate", CASE WHEN f."eventId" IS NULL THEN 3 ELSE 0 END)::numeric AS "defaultPrivRate",
           COALESCE(f."ubuPrivilegeMode", FALSE) AS "ubuPrivilegeMode"
    FROM events e
    LEFT JOIN event_fee_settings f ON f."eventId" = e.id
    WHERE e.id = ANY($1::text[])
  ),
  order_agg AS (
    SELECT o.id AS "orderId",
           o."eventId",
           MIN(t."sessionId") AS "sessionId",
           MIN(t.id) AS "firstTicketId",
           o."buyerName",
           o."buyerEmail",
           o."buyerPhone",
           o."createdAt" AS "orderCreatedAt",
           COUNT(t.id)::int AS "totalTicketsCount",
           COUNT(t.id) FILTER (WHERE t.status = 'valid')::int AS "validTicketsCount",
           ROUND(SUM(COALESCE(t.price, oi."unitPrice"))::numeric, 2) AS "grossSubtotal",
           ROUND(COALESCE(SUM(COALESCE(t.price, oi."unitPrice")) FILTER (WHERE t.status = 'valid'), 0)::numeric, 2) AS "netSubtotal",
           (
             COALESCE(o."ubuPrivilegeApplied", FALSE)
             OR (
               TRIM(COALESCE(o."buyerEmail", '')) ~* '@([a-zA-Z0-9-]+.)*ubu\\.ac\\.th$'
               AND (cfg."ubuPrivilegeMode" OR o."eventId" = 'event-ubu-freshy-2026')
             )
           ) AS "isUbuBuyer",
           COALESCE(o."organizerFeeMode", cfg."defaultFeeMode") AS "effectiveFeeMode",
           COALESCE(o."organizerFeeRate", cfg."defaultFeeRate")::numeric AS "effectiveFeeRate",
           COALESCE(o."organizerFeePrivilegeRate", cfg."defaultPrivRate")::numeric AS "effectivePrivRate"
    FROM orders o
    JOIN event_fee_cfg cfg ON cfg."eventId" = o."eventId"
    JOIN order_items oi ON oi."orderId" = o.id
    JOIN tickets t ON t."orderItemId" = oi.id
    WHERE o."eventId" = ANY($1::text[])
    GROUP BY o.id, o."eventId", o."buyerName", o."buyerEmail", o."buyerPhone", o."createdAt",
             o."ubuPrivilegeApplied", o."organizerFeeMode", o."organizerFeeRate", o."organizerFeePrivilegeRate",
             cfg."defaultFeeMode", cfg."defaultFeeRate", cfg."defaultPrivRate", cfg."ubuPrivilegeMode"
  ),
  order_fees AS (
    SELECT oa."orderId",
           oa."eventId",
           oa."sessionId",
           oa."firstTicketId",
           oa."buyerName",
           oa."buyerEmail",
           oa."buyerPhone",
           oa."orderCreatedAt",
           oa."totalTicketsCount",
           oa."validTicketsCount",
           (oa."totalTicketsCount" - oa."validTicketsCount")::int AS "refundedTicketsCount",
           oa."grossSubtotal",
           oa."netSubtotal",
           ROUND((oa."grossSubtotal" - oa."netSubtotal")::numeric, 2) AS "refundDeductions",
           CASE oa."effectiveFeeMode"
             WHEN 'percentage' THEN
               ROUND((oa."grossSubtotal" * (CASE WHEN oa."isUbuBuyer" THEN oa."effectivePrivRate" ELSE oa."effectiveFeeRate" END) / 100.0)::numeric, 2)
             WHEN 'per_ticket' THEN
               ROUND((oa."totalTicketsCount" * oa."effectiveFeeRate")::numeric, 2)
             ELSE 0::numeric
           END AS "orderFeeOriginal",
           CASE oa."effectiveFeeMode"
             WHEN 'percentage' THEN
               ROUND((oa."netSubtotal" * (CASE WHEN oa."isUbuBuyer" THEN oa."effectivePrivRate" ELSE oa."effectiveFeeRate" END) / 100.0)::numeric, 2)
             WHEN 'per_ticket' THEN
               ROUND((oa."validTicketsCount" * oa."effectiveFeeRate")::numeric, 2)
             ELSE 0::numeric
           END AS "orderFeeAdjusted"
    FROM order_agg oa
  )`;

interface PayoutRow {
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
}

function mapPayoutRow(p: PayoutRow, isOwner: boolean): PayoutHistoryItem {
  return {
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
  };
}

export function parseMoneyReportQueryOptions(requestUrl: string): GetEventMoneyReportOptions {
  const { searchParams } = new URL(requestUrl, 'http://localhost');
  const includeOrdersParam = searchParams.get('includeOrders');
  const pageParam = searchParams.get('ordersPage');
  const limitParam = searchParams.get('ordersLimit');
  const ordersPage = pageParam ? Number.parseInt(pageParam, 10) : undefined;
  const ordersLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  return {
    includeOrders: includeOrdersParam !== 'false',
    ...(ordersPage !== undefined && Number.isFinite(ordersPage) ? { ordersPage } : {}),
    ...(ordersLimit !== undefined && Number.isFinite(ordersLimit) ? { ordersLimit } : {}),
  };
}

/**
 * Generates the full Event Money Report with access control and privacy masking (AC-28, AC-64, AC-77, AC-78, AC-80, AC-81, AC-82, AC-110, AC-84).
 * Aggregates order/session/event totals in PostgreSQL and supports optional order pagination or summary-only mode.
 */
export async function getEventMoneyReport(
  pool: Pool | PoolClient,
  eventId: string,
  actor: ActorContext,
  options?: GetEventMoneyReportOptions,
): Promise<EventMoneyReportDetail> {
  if ('connect' in pool) {
    await ensureReportSchema(pool);
  }

  // 1. Role enforcement (AC-82): Scanners are strictly rejected
  if (actor.role === 'scanner') {
    throw new Error('ไม่อนุญาต: ทีมสแกนไม่มีสิทธิ์เข้าถึงรายงานการเงิน');
  }

  // 2. Fetch event + fee settings + verify organizer ownership in 1 query (AC-07, AC-82)
  const eventRes = await pool.query<{
    id: string;
    title: string;
    organizerId: string;
    organizerName: string;
    organizerFeeMode: OrganizerFeeMode | null;
    organizerFeeRate: string | null;
    reservePercentage: string | null;
  }>(
    `SELECT e.id, e.title, e."organizerId", u.name AS "organizerName",
            f."organizerFeeMode", f."organizerFeeRate", f."reservePercentage"
     FROM events e
     JOIN auth_user u ON u.id = e."organizerId"
     LEFT JOIN event_fee_settings f ON f."eventId" = e.id
     WHERE e.id = $1`,
    [eventId],
  );

  if (eventRes.rowCount === 0) {
    throw new Error('ไม่พบข้อมูลคอนเสิร์ตที่ระบุ');
  }

  const event = eventRes.rows[0];

  if (actor.role === 'organizer' && event.organizerId !== actor.id) {
    throw new Error('ไม่อนุญาต: ผู้จัดงานสามารถเข้าถึงรายงานได้เฉพาะงานของตนเองเท่านั้น');
  }

  const isOrganizerActor = actor.role === 'organizer';
  const isOwner = actor.role === 'owner';
  const organizerFeeMode: OrganizerFeeMode = (event.organizerFeeMode || 'percentage') as OrganizerFeeMode;
  const organizerFeeRate = event.organizerFeeRate != null ? Number(event.organizerFeeRate) : 0;
  const reservePercentage = event.reservePercentage != null ? Number(event.reservePercentage) : 0;

  const includeOrders = options?.includeOrders !== false;
  const hasPagination = options?.ordersPage !== undefined || options?.ordersLimit !== undefined;
  const page = hasPagination ? Math.max(1, Math.floor(options?.ordersPage || 1)) : 1;
  const limit = hasPagination ? Math.min(500, Math.max(1, Math.floor(options?.ordersLimit || 50))) : 0;
  const offset = hasPagination ? (page - 1) * limit : 0;

  // 3. Aggregate event totals, sessions, payouts, reserve releases, repayments, and (optionally) orders in parallel
  const eventAggQuery = pool.query<{
    totalOrdersCount: number;
    totalTicketsIssuedCount: number;
    totalTicketsValidCount: number;
    totalTicketsRefundedCount: number;
    grossSales: string;
    approvedRefunds: string;
    netSales: string;
    orderFeesSum: string;
  }>(
    `${ORDER_FEES_CTE}
     SELECT COUNT(*)::int AS "totalOrdersCount",
            COALESCE(SUM("totalTicketsCount"), 0)::int AS "totalTicketsIssuedCount",
            COALESCE(SUM("validTicketsCount"), 0)::int AS "totalTicketsValidCount",
            COALESCE(SUM("refundedTicketsCount"), 0)::int AS "totalTicketsRefundedCount",
            COALESCE(SUM("grossSubtotal"), 0)::text AS "grossSales",
            COALESCE(SUM("refundDeductions"), 0)::text AS "approvedRefunds",
            COALESCE(SUM("netSubtotal"), 0)::text AS "netSales",
            COALESCE(SUM("orderFeeAdjusted"), 0)::text AS "orderFeesSum"
     FROM order_fees`,
    [[eventId]],
  );

  const sessQuery = pool.query<{
    id: string;
    startTime: Date;
    endTime: Date;
    status: string;
    issuedTicketsCount: number;
    validTicketsCount: number;
    refundedTicketsCount: number;
    grossSales: string;
    netSales: string;
  }>(
    `WITH sess_agg AS (
       SELECT t."sessionId",
              COUNT(t.id)::int AS "issuedTicketsCount",
              COUNT(t.id) FILTER (WHERE t.status = 'valid')::int AS "validTicketsCount",
              COUNT(t.id) FILTER (WHERE t.status <> 'valid')::int AS "refundedTicketsCount",
              ROUND(SUM(COALESCE(t.price, oi."unitPrice"))::numeric, 2) AS "grossSales",
              ROUND(COALESCE(SUM(COALESCE(t.price, oi."unitPrice")) FILTER (WHERE t.status = 'valid'), 0)::numeric, 2) AS "netSales"
       FROM orders o
       JOIN order_items oi ON oi."orderId" = o.id
       JOIN tickets t ON t."orderItemId" = oi.id
       WHERE o."eventId" = $1
       GROUP BY t."sessionId"
     )
     SELECT s.id, s."startTime", s."endTime", s.status,
            COALESCE(sa."issuedTicketsCount", 0)::int AS "issuedTicketsCount",
            COALESCE(sa."validTicketsCount", 0)::int AS "validTicketsCount",
            COALESCE(sa."refundedTicketsCount", 0)::int AS "refundedTicketsCount",
            COALESCE(sa."grossSales", 0)::text AS "grossSales",
            COALESCE(sa."netSales", 0)::text AS "netSales"
     FROM event_sessions s
     LEFT JOIN sess_agg sa ON sa."sessionId" = s.id
     WHERE s."eventId" = $1
     ORDER BY s."startTime" ASC`,
    [eventId],
  );

  const payoutsQuery = pool.query<PayoutRow>(
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

  const releasesQuery = pool.query<{
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

  const repaymentsQuery = pool.query<{
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

  const ordersQuery = includeOrders
    ? pool.query<{
        orderId: string;
        sessionId: string;
        buyerName: string;
        buyerEmail: string;
        buyerPhone: string;
        orderCreatedAt: Date;
        totalTicketsCount: number;
        validTicketsCount: number;
        refundedTicketsCount: number;
        grossSubtotal: string;
        refundDeductions: string;
        netSubtotal: string;
        orderFeeOriginal: string;
        orderFeeAdjusted: string;
      }>(
        `${ORDER_FEES_CTE}
         SELECT "orderId", "sessionId", "buyerName", "buyerEmail", "buyerPhone", "orderCreatedAt",
                "totalTicketsCount", "validTicketsCount", "refundedTicketsCount",
                "grossSubtotal"::text, "refundDeductions"::text, "netSubtotal"::text,
                "orderFeeOriginal"::text, "orderFeeAdjusted"::text
         FROM order_fees
         ORDER BY "orderCreatedAt" ASC, "firstTicketId" ASC
         ${hasPagination ? 'LIMIT $2 OFFSET $3' : ''}`,
        hasPagination ? [[eventId], limit, offset] : [[eventId]],
      )
    : Promise.resolve(null);

  const [eventAggRes, sessRes, payoutsListRes, releasesListRes, repaymentsListRes, ordersRes] =
    await Promise.all([
      eventAggQuery,
      sessQuery,
      payoutsQuery,
      releasesQuery,
      repaymentsQuery,
      ordersQuery,
    ]);

  const aggRow = eventAggRes.rows[0];
  const totalOrdersCount = aggRow?.totalOrdersCount ?? 0;
  const totalTicketsIssued = aggRow?.totalTicketsIssuedCount ?? 0;
  const totalTicketsValid = aggRow?.totalTicketsValidCount ?? 0;
  const totalTicketsRefunded = aggRow?.totalTicketsRefundedCount ?? 0;
  const totalGrossSales = roundHalfUp(Number(aggRow?.grossSales || 0));
  const totalApprovedRefunds = roundHalfUp(Number(aggRow?.approvedRefunds || 0));
  const totalNetSales = roundHalfUp(Number(aggRow?.netSales || 0));
  const totalOrderFeesSum = roundHalfUp(Number(aggRow?.orderFeesSum || 0));

  const ordersList: OrderMoneyItem[] = ordersRes
    ? ordersRes.rows.map(o => {
        const orderFeeOriginal = roundHalfUp(Number(o.orderFeeOriginal));
        const orderFeeAdjusted = roundHalfUp(Number(o.orderFeeAdjusted));
        return {
          orderId: o.orderId,
          sessionId: o.sessionId,
          buyerName: o.buyerName,
          buyerEmail: isOrganizerActor ? maskEmail(o.buyerEmail) : o.buyerEmail,
          buyerPhone: isOrganizerActor ? maskPhone(o.buyerPhone) : o.buyerPhone,
          createdAt:
            o.orderCreatedAt instanceof Date ? o.orderCreatedAt.toISOString() : String(o.orderCreatedAt),
          totalTicketsCount: o.totalTicketsCount,
          validTicketsCount: o.validTicketsCount,
          refundedTicketsCount: o.refundedTicketsCount,
          grossSubtotal: roundHalfUp(Number(o.grossSubtotal)),
          refundDeductions: roundHalfUp(Number(o.refundDeductions)),
          netSubtotal: roundHalfUp(Number(o.netSubtotal)),
          orderFeeOriginal,
          orderFeeAdjusted,
          feeAdjustment: roundHalfUp(orderFeeOriginal - orderFeeAdjusted),
        };
      })
    : [];

  const sessions: SessionMoneySummary[] = sessRes.rows.map(s => {
    const grossSales = roundHalfUp(Number(s.grossSales || 0));
    const netSales = roundHalfUp(Number(s.netSales || 0));
    return {
      sessionId: s.id,
      sessionStartTime: s.startTime instanceof Date ? s.startTime.toISOString() : String(s.startTime),
      sessionEndTime: s.endTime instanceof Date ? s.endTime.toISOString() : String(s.endTime),
      sessionStatus: s.status,
      issuedTicketsCount: s.issuedTicketsCount,
      validTicketsCount: s.validTicketsCount,
      refundedTicketsCount: s.refundedTicketsCount,
      grossSales,
      approvedRefunds: roundHalfUp(grossSales - netSales),
      netSales,
    };
  });

  const payouts: PayoutHistoryItem[] = payoutsListRes.rows.map(p => mapPayoutRow(p, isOwner));
  const totalPaidOut = payouts.reduce(
    (sum, p) => (p.status === 'completed' ? roundHalfUp(sum + p.amount) : sum),
    0,
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
  const totalReserveReleased = reserveReleases.reduce(
    (sum, r) => roundHalfUp(sum + r.amount),
    0,
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
  const totalDebtRepaid = repayments.reduce((sum, r) => roundHalfUp(sum + r.amount), 0);

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

  // 4. Calculate overall accounting
  const accounting = calculateEventAccounting({
    netSales: totalNetSales,
    grossSales: totalGrossSales,
    approvedRefunds: totalApprovedRefunds,
    organizerFeeMode,
    organizerFeeRate,
    orderFeesSum: totalOrderFeesSum,
    reservePercentage,
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
    totalOrdersCount,
    totalTicketsIssuedCount: totalTicketsIssued,
    totalTicketsValidCount: totalTicketsValid,
    totalTicketsRefundedCount: totalTicketsRefunded,
    finalSessionEnd,
    isFinalSessionEnded,
    sessions,
    orders: ordersList,
    ...(hasPagination && includeOrders
      ? {
          ordersPagination: {
            page,
            limit,
            totalCount: totalOrdersCount,
            totalPages: totalOrdersCount > 0 ? Math.ceil(totalOrdersCount / limit) : 0,
          },
        }
      : {}),
    payouts,
    reserveReleases,
    repayments,
  };
}

/**
 * Shared batch summary loader for Owner Finance Hub and Organizer Finance/Overview Hub.
 * Executes a constant O(1) number of SQL queries regardless of event count.
 */
async function getBatchFinanceSummaries(
  pool: Pool,
  actor: ActorContext,
  scopeOrganizerId?: string,
): Promise<EventFinanceSummaryItem[]> {
  if (actor.role === 'scanner') {
    throw new Error('ไม่อนุญาต: ทีมสแกนไม่มีสิทธิ์เข้าถึงรายงานการเงิน');
  }

  const { ensureEventSchema } = await import('./events.ts');
  await ensureEventSchema(pool);
  await ensureReportSchema(pool);

  const filterOrganizerId =
    actor.role === 'organizer' ? actor.id : scopeOrganizerId || null;

  const eventsRes = await pool.query<{
    id: string;
    title: string;
    location: string;
    status: string;
    organizerId: string;
    organizerName: string;
    organizerEmail: string;
    payoutBankName: string | null;
    payoutAccountNumber: string | null;
    payoutAccountName: string | null;
    organizerFeeMode: OrganizerFeeMode | null;
    organizerFeeRate: string | null;
    reservePercentage: string | null;
  }>(
    `SELECT e.id, e.title, e.location, e.status, e."organizerId",
            u.name AS "organizerName", u.email AS "organizerEmail",
            e."payoutBankName", e."payoutAccountNumber", e."payoutAccountName",
            f."organizerFeeMode", f."organizerFeeRate", f."reservePercentage"
     FROM events e
     JOIN auth_user u ON u.id = e."organizerId"
     LEFT JOIN event_fee_settings f ON f."eventId" = e.id
     WHERE ($1::text IS NULL OR e."organizerId" = $1)
     ORDER BY e."createdAt" DESC`,
    [filterOrganizerId],
  );

  if (eventsRes.rows.length === 0) {
    return [];
  }

  const eventIds = eventsRes.rows.map(r => r.id);
  const isOwner = actor.role === 'owner';

  const [ordersAggRes, sessAggRes, payoutsRes, debtAggRes, reserveAggRes] = await Promise.all([
    pool.query<{
      eventId: string;
      totalOrdersCount: number;
      totalTicketsIssuedCount: number;
      totalTicketsValidCount: number;
      totalTicketsRefundedCount: number;
      grossSales: string;
      approvedRefunds: string;
      netSales: string;
      orderFeesSum: string;
    }>(
      `${ORDER_FEES_CTE}
       SELECT "eventId",
              COUNT(*)::int AS "totalOrdersCount",
              COALESCE(SUM("totalTicketsCount"), 0)::int AS "totalTicketsIssuedCount",
              COALESCE(SUM("validTicketsCount"), 0)::int AS "totalTicketsValidCount",
              COALESCE(SUM("refundedTicketsCount"), 0)::int AS "totalTicketsRefundedCount",
              COALESCE(SUM("grossSubtotal"), 0)::text AS "grossSales",
              COALESCE(SUM("refundDeductions"), 0)::text AS "approvedRefunds",
              COALESCE(SUM("netSubtotal"), 0)::text AS "netSales",
              COALESCE(SUM("orderFeeAdjusted"), 0)::text AS "orderFeesSum"
       FROM order_fees
       GROUP BY "eventId"`,
      [eventIds],
    ),
    pool.query<{
      eventId: string;
      firstSessionStartTime: Date | null;
      activeMaxEnd: Date | null;
      allMaxEnd: Date | null;
    }>(
      `SELECT "eventId",
              MIN("startTime") AS "firstSessionStartTime",
              MAX("endTime") FILTER (WHERE status <> 'cancelled') AS "activeMaxEnd",
              MAX("endTime") AS "allMaxEnd"
       FROM event_sessions
       WHERE "eventId" = ANY($1::text[])
       GROUP BY "eventId"`,
      [eventIds],
    ),
    pool.query<PayoutRow>(
      `SELECT ep.id, ep."eventId", ep.amount::text, ep.status, ep."paidAt",
              ep."transferProofKey", ep."transferProofUrl", ep."transferNote",
              ep."transferFailureReason", ep."transferFailedAt",
              u.name AS "recordedByName", ep."createdAt"
       FROM event_payouts ep
       LEFT JOIN auth_user u ON u.id = ep."recordedBy"
       WHERE ep."eventId" = ANY($1::text[])
       ORDER BY ep."paidAt" DESC, ep."createdAt" DESC`,
      [eventIds],
    ),
    pool.query<{ eventId: string; totalDebtRepaid: string }>(
      `SELECT "eventId", COALESCE(SUM(amount), 0)::text AS "totalDebtRepaid"
       FROM event_debt_repayments
       WHERE "eventId" = ANY($1::text[])
       GROUP BY "eventId"`,
      [eventIds],
    ),
    pool.query<{ eventId: string; totalReleased: string }>(
      `SELECT "eventId", COALESCE(SUM(amount), 0)::text AS "totalReleased"
       FROM event_reserve_releases
       WHERE "eventId" = ANY($1::text[])
       GROUP BY "eventId"`,
      [eventIds],
    ),
  ]);

  const orderAggMap = new Map(ordersAggRes.rows.map(r => [r.eventId, r]));
  const sessAggMap = new Map(sessAggRes.rows.map(r => [r.eventId, r]));
  const debtMap = new Map(debtAggRes.rows.map(r => [r.eventId, roundHalfUp(Number(r.totalDebtRepaid || 0))]));
  const reserveRelMap = new Map(reserveAggRes.rows.map(r => [r.eventId, roundHalfUp(Number(r.totalReleased || 0))]));

  const payoutsByEvent = new Map<string, { items: PayoutHistoryItem[]; totalPaidOut: number }>();
  for (const row of payoutsRes.rows) {
    const item = mapPayoutRow(row, isOwner);
    const existing = payoutsByEvent.get(row.eventId) || { items: [], totalPaidOut: 0 };
    existing.items.push(item);
    if (item.status === 'completed') {
      existing.totalPaidOut = roundHalfUp(existing.totalPaidOut + item.amount);
    }
    payoutsByEvent.set(row.eventId, existing);
  }

  const nowMs = Date.now();

  return eventsRes.rows.map(ev => {
    const orderAgg = orderAggMap.get(ev.id);
    const sessAgg = sessAggMap.get(ev.id);
    const payoutBucket = payoutsByEvent.get(ev.id) || { items: [], totalPaidOut: 0 };

    const totalOrdersCount = orderAgg?.totalOrdersCount ?? 0;
    const totalTicketsIssuedCount = orderAgg?.totalTicketsIssuedCount ?? 0;
    const totalTicketsValidCount = orderAgg?.totalTicketsValidCount ?? 0;
    const totalTicketsRefundedCount = orderAgg?.totalTicketsRefundedCount ?? 0;
    const grossSales = roundHalfUp(Number(orderAgg?.grossSales || 0));
    const approvedRefunds = roundHalfUp(Number(orderAgg?.approvedRefunds || 0));
    const netSales = roundHalfUp(Number(orderAgg?.netSales || 0));
    const orderFeesSum = roundHalfUp(Number(orderAgg?.orderFeesSum || 0));

    const organizerFeeMode: OrganizerFeeMode = (ev.organizerFeeMode || 'percentage') as OrganizerFeeMode;
    const organizerFeeRate = ev.organizerFeeRate != null ? Number(ev.organizerFeeRate) : 0;
    const reservePercentage = ev.reservePercentage != null ? Number(ev.reservePercentage) : 0;

    const totalPaidOut = payoutBucket.totalPaidOut;
    const totalDebtRepaid = debtMap.get(ev.id) ?? 0;
    const totalReserveReleased = reserveRelMap.get(ev.id) ?? 0;

    const accounting = calculateEventAccounting({
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
    });

    const finalEndRaw = sessAgg?.activeMaxEnd || sessAgg?.allMaxEnd || null;
    const finalEndDate = finalEndRaw ? (finalEndRaw instanceof Date ? finalEndRaw : new Date(finalEndRaw)) : null;
    const firstStartRaw = sessAgg?.firstSessionStartTime || null;
    const firstStartIso = firstStartRaw
      ? (firstStartRaw instanceof Date ? firstStartRaw.toISOString() : String(firstStartRaw))
      : null;

    return {
      ...accounting,
      eventId: ev.id,
      eventTitle: ev.title,
      location: ev.location || 'สถานที่จัดแสดง',
      status: ev.status,
      organizerId: ev.organizerId,
      organizerName: ev.organizerName || 'ผู้จัดงาน',
      organizerEmail: isOwner ? (ev.organizerEmail || '') : maskEmail(ev.organizerEmail || ''),
      payoutBankName: ev.payoutBankName || '',
      payoutAccountNumber: ev.payoutAccountNumber || '',
      payoutAccountName: ev.payoutAccountName || '',
      firstSessionStartTime: firstStartIso,
      finalSessionEnd: finalEndDate ? finalEndDate.toISOString() : null,
      isFinalSessionEnded: finalEndDate ? nowMs >= finalEndDate.getTime() : false,
      totalPaidOut,
      totalDebtRepaid,
      totalReserveReleased,
      totalOrdersCount,
      totalTicketsIssuedCount,
      totalTicketsValidCount,
      totalTicketsRefundedCount,
      validTicketsCount: totalTicketsValidCount,
      payouts: payoutBucket.items,
    };
  });
}

export async function getOwnerFinanceSummaries(
  pool: Pool,
  actor: ActorContext,
): Promise<EventFinanceSummaryItem[]> {
  if (actor.role !== 'owner') {
    throw new Error('ไม่อนุญาต: เฉพาะเจ้าของแพลตฟอร์มเท่านั้น');
  }
  return getBatchFinanceSummaries(pool, actor);
}

export async function getOrganizerFinanceSummaries(
  pool: Pool,
  actor: ActorContext,
  scopeOrganizerId?: string,
): Promise<EventFinanceSummaryItem[]> {
  if (actor.role !== 'organizer' && actor.role !== 'owner') {
    throw new Error('ไม่อนุญาต: เฉพาะผู้จัดงานหรือเจ้าของแพลตฟอร์มเท่านั้น');
  }
  return getBatchFinanceSummaries(pool, actor, scopeOrganizerId);
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
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์บันทึกการโอนเงินให้ผู้จัดงาน',
    };
  }

  const status = input.status || 'completed';
  const amount = roundHalfUp(Number(input.amount || 0));

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      success: false,
      code: 'INVALID_AMOUNT',
      error: 'จำนวนเงินที่บันทึกโอนต้องมากกว่า 0 บาท',
    };
  }

  const proofCheck = validateTransferProof(input.transferProofKey, input.transferProofUrl);
  if (!proofCheck.valid) {
    return {
      success: false,
      code: 'INVALID_PROOF',
      error: proofCheck.error,
    };
  }

  return inTransaction(pool, async client => {
    // Serialize payout checks and inserts per eventId to prevent concurrent overpayment
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`payout:${input.eventId}`]);

    // 1. Concurrency / duplicate submission protection (AC-87)
    // Check if an identical completed payout was submitted in the last 15 seconds
    if (status === 'completed') {
      const recentDup = await client.query<{ id: string; amount: string }>(
        `SELECT id, amount::text
         FROM event_payouts
         WHERE "eventId" = $1 AND amount = $2 AND status = 'completed' AND "paidAt" >= now() - INTERVAL '15 seconds'`,
        [input.eventId, amount],
      );

      if (recentDup.rowCount && recentDup.rowCount > 0) {
        const report = await getEventMoneyReport(
          client,
          input.eventId,
          { id: input.recordedBy || '', role: 'owner' },
          { includeOrders: false },
        );
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
      const currentReport = await getEventMoneyReport(
        client,
        input.eventId,
        { id: input.recordedBy || '', role: 'owner' },
        { includeOrders: false },
      );
      if (currentReport.payableAmount <= 0) {
        return {
          success: false,
          code: 'CANNOT_PAY_ZERO_PAYABLE',
          error: 'ไม่มียอดพร้อมจ่าย (Payable = 0) สำหรับคอนเสิร์ตนี้ ไม่สามารถโอนจ่ายได้',
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

    await client.query(
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
        proofCheck.transferProofKey,
        proofCheck.transferProofUrl,
        input.transferNote?.trim() || null,
        input.transferFailureReason?.trim() || null,
        failedAt,
        input.recordedBy || null,
      ],
    );

    const updatedReport = await getEventMoneyReport(
      client,
      input.eventId,
      { id: input.recordedBy || '', role: 'owner' },
      { includeOrders: false },
    );

    return {
      success: true,
      payoutId: id,
      status,
      amount,
      payableAmount: updatedReport.payableAmount,
    };
  });
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
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์เข้าถึงไฟล์หลักฐานการโอนเงิน',
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
    const currentReport = await getEventMoneyReport(pool, input.eventId, { id: input.recordedBy || 'system', role: 'owner' }, { includeOrders: false });
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
  const reportBefore = await getEventMoneyReport(pool, input.eventId, { id: input.recordedBy || 'system', role: 'owner' }, { includeOrders: false });
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
  const updatedReport = await getEventMoneyReport(pool, input.eventId, { id: input.recordedBy || 'system', role: 'owner' }, { includeOrders: false });

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
      error: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์สั่งปล่อยเงินสำรอง',
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
      }, { includeOrders: false });
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
      error: 'ไม่สามารถปล่อยเงินสำรองได้ก่อนรอบสุดท้ายของคอนเสิร์ตจะสิ้นสุดลง',
    };
  }

  // 4. Retrieve current accounting and validate held reserve
  const report = await getEventMoneyReport(pool, input.eventId, {
    id: input.recordedBy || 'system',
    role: 'owner',
  }, { includeOrders: false });

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
  }, { includeOrders: false });

  return {
    success: true,
    releaseId: id,
    amount: releaseAmount,
    remainingHeldReserve: updatedReport.actualHeldReserve,
    newPayableAmount: updatedReport.payableAmount,
  };
}
