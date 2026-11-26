import type { Pool } from 'pg';
import { getEventSalesStatus } from '../lib/sales-window.ts';
import { getOwnerFinanceSummaries } from './reports.ts';
import { ensureEventSchema } from './events.ts';
import { ensureRefundSchema } from './refunds.ts';
import { ensureTicketDeliverySchema } from './ticket-delivery.ts';
import { ensurePaymentSchema } from './payment.ts';
import { ensureAdmissionSchema } from './admission.ts';
import { ensureNewsSchema } from './news.ts';

export interface OwnerOverviewCounts {
  pendingSessions: number;
  pendingRefunds: number;
  failedEmails: number;
  paymentExceptions: number;
  syncConflicts: number;
  pendingNews?: number;
  totalPending: number;
}

/**
 * Aggregates pending action item counts for owner overview dashboard (AC-115, D-17).
 * Reads central shared state from PostgreSQL across 5 operational queues.
 */
export async function getOwnerOverviewCounts(pool: Pool): Promise<OwnerOverviewCounts> {
  await ensureEventSchema(pool);
  await ensureRefundSchema(pool);
  await ensureTicketDeliverySchema(pool);
  await ensurePaymentSchema(pool);
  await ensureAdmissionSchema(pool);
  await ensureNewsSchema(pool);

  const countsRes = await pool.query<{
    sessionsCount: number;
    amendmentsCount: number;
    cancellationsCount: number;
    pendingRefunds: number;
    failedEmails: number;
    paymentExceptions: number;
    syncConflicts: number;
    pendingNews: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM event_sessions WHERE status = 'pending_approval') AS "sessionsCount",
      (SELECT COUNT(*)::int FROM session_amendments WHERE status = 'pending') AS "amendmentsCount",
      (SELECT COUNT(*)::int FROM session_cancellations WHERE status = 'pending') AS "cancellationsCount",
      (SELECT COUNT(*)::int FROM refund_requests WHERE status = 'pending') AS "pendingRefunds",
      (SELECT COUNT(*)::int FROM ticket_email_deliveries WHERE status = 'failed') AS "failedEmails",
      (SELECT COUNT(*)::int FROM payment_recovery_cases WHERE status = 'pending_review') AS "paymentExceptions",
      (SELECT COUNT(*)::int FROM admission_sync_conflicts WHERE status = 'pending_review') AS "syncConflicts",
      (SELECT COUNT(*)::int FROM news WHERE status = 'pending') AS "pendingNews"
  `);

  const row = countsRes.rows[0];
  const pendingSessions =
    Number(row?.sessionsCount || 0) +
    Number(row?.amendmentsCount || 0) +
    Number(row?.cancellationsCount || 0);

  const pendingRefunds = Number(row?.pendingRefunds || 0);
  const failedEmails = Number(row?.failedEmails || 0);
  const paymentExceptions = Number(row?.paymentExceptions || 0);
  const syncConflicts = Number(row?.syncConflicts || 0);
  const pendingNews = Number(row?.pendingNews || 0);

  const totalPending =
    pendingSessions +
    pendingRefunds +
    failedEmails +
    paymentExceptions +
    syncConflicts +
    pendingNews;

  return {
    pendingSessions,
    pendingRefunds,
    failedEmails,
    paymentExceptions,
    syncConflicts,
    pendingNews,
    totalPending,
  };
}

export interface OwnerOverviewSales {
  totalEvents: number;
  openEvents: number;
  grossSales: number;
  platformFee: number;
  pendingPayouts?: number;
  concerts: { id: string; title: string; status: string; open: boolean; quota: number; soldCount: number; sales: number }[];
  trend: Record<'today' | '7d' | '30d', { label: string; date: string; value: number }[]>;
}

export async function getOwnerOverviewSales(pool: Pool, ownerId: string): Promise<OwnerOverviewSales> {
  const summaries = await getOwnerFinanceSummaries(pool, { id: ownerId, role: 'owner' });
  const [events, trend] = await Promise.all([
    pool.query<{
      id: string; status: string; quota: number; isSalesPaused: boolean;
      salesStartTime: Date | null; salesEndTime: Date | null; lastApprovedEnd: Date | null;
    }>(`SELECT e.id, e.status, e."isSalesPaused", e."salesStartTime", e."salesEndTime",
              COALESCE(SUM(tt.quota), 0)::int AS quota,
              MAX(s."endTime") FILTER (WHERE s.status = 'approved') AS "lastApprovedEnd"
       FROM events e
       LEFT JOIN event_sessions s ON s."eventId" = e.id
       LEFT JOIN ticket_types tt ON tt."sessionId" = s.id
       GROUP BY e.id`),
    pool.query<{ range: 'today' | '7d' | '30d'; label: string; date: string; value: number }>(`
       WITH clock AS (
         SELECT date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AS today
       ), buckets AS (
         SELECT 'today' AS range, start, INTERVAL '4 hours' AS span, 'HH24:MI' AS format
         FROM clock, generate_series(today, today + INTERVAL '20 hours', INTERVAL '4 hours') start
         UNION ALL
         SELECT '7d', start, INTERVAL '1 day', 'DD/MM'
         FROM clock, generate_series(today - INTERVAL '6 days', today, INTERVAL '1 day') start
         UNION ALL
         SELECT '30d', start, INTERVAL '6 days', 'DD/MM'
         FROM clock, generate_series(today - INTERVAL '29 days', today, INTERVAL '6 days') start
       ), ticket_sales AS (
         SELECT t."createdAt" AT TIME ZONE 'Asia/Bangkok' AS issued,
                COALESCE(t.price, oi."unitPrice") AS price
         FROM tickets t
         JOIN order_items oi ON oi.id = t."orderItemId"
         WHERE t."createdAt" >= ((SELECT today FROM clock) - INTERVAL '29 days') AT TIME ZONE 'Asia/Bangkok'
       )
       SELECT b.range, to_char(b.start, b.format) AS label,
              CASE WHEN b.range = '30d'
                   THEN to_char(b.start, 'DD/MM') || ' – ' || to_char(b.start + INTERVAL '5 days', 'DD/MM')
                   ELSE to_char(b.start, 'DD/MM/YYYY HH24:MI') END AS date,
              COALESCE(SUM(t.price), 0)::float8 AS value
       FROM buckets b LEFT JOIN ticket_sales t ON t.issued >= b.start AND t.issued < b.start + b.span
       GROUP BY b.range, b.start, b.format
       ORDER BY b.start
    `),
  ]);

  const eventById = new Map(events.rows.map(event => [event.id, event]));
  const isOpen = (event: (typeof events.rows)[number]) =>
    event.status === 'approved' && event.lastApprovedEnd !== null &&
    getEventSalesStatus({ ...event, sessions: [{ endTime: event.lastApprovedEnd }] }).isOpen;

  const concerts = summaries.filter(summary => summary.totalTicketsIssuedCount > 0).map(summary => {
    const event = eventById.get(summary.eventId);
    return {
      id: summary.eventId,
      title: summary.eventTitle,
      status: summary.status,
      open: event ? isOpen(event) : false,
      quota: event?.quota ?? 0,
      soldCount: summary.totalTicketsIssuedCount,
      sales: summary.grossSales,
    };
  });
  const sumMoney = (field: 'grossSales' | 'organizerFee') =>
    summaries.reduce((total, summary) => total + Math.round(summary[field] * 100), 0) / 100;

  const pendingPayouts = summaries.filter(
    summary => summary.payableAmount > 0 || summary.actualHeldReserve > 0,
  ).length;

  return {
    totalEvents: events.rows.length,
    openEvents: events.rows.filter(isOpen).length,
    grossSales: sumMoney('grossSales'),
    platformFee: sumMoney('organizerFee'),
    pendingPayouts,
    concerts,
    trend: {
      today: trend.rows.filter(point => point.range === 'today'),
      '7d': trend.rows.filter(point => point.range === '7d'),
      '30d': trend.rows.filter(point => point.range === '30d'),
    },
  };
}
