import type { Pool } from 'pg';
import { ensureEventSchema } from './events.ts';
import { ensureRefundSchema } from './refunds.ts';
import { ensureTicketDeliverySchema } from './ticket-delivery.ts';
import { ensurePaymentSchema } from './payment.ts';
import { ensureAdmissionSchema } from './admission.ts';

export interface OwnerOverviewCounts {
  pendingSessions: number;
  pendingRefunds: number;
  failedEmails: number;
  paymentExceptions: number;
  syncConflicts: number;
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

  const countsRes = await pool.query<{
    sessionsCount: number;
    amendmentsCount: number;
    cancellationsCount: number;
    pendingRefunds: number;
    failedEmails: number;
    paymentExceptions: number;
    syncConflicts: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM event_sessions WHERE status = 'pending_approval') AS "sessionsCount",
      (SELECT COUNT(*)::int FROM session_amendments WHERE status = 'pending') AS "amendmentsCount",
      (SELECT COUNT(*)::int FROM session_cancellations WHERE status = 'pending') AS "cancellationsCount",
      (SELECT COUNT(*)::int FROM refund_requests WHERE status = 'pending') AS "pendingRefunds",
      (SELECT COUNT(*)::int FROM ticket_email_deliveries WHERE status = 'failed') AS "failedEmails",
      (SELECT COUNT(*)::int FROM payment_recovery_cases WHERE status = 'pending_review') AS "paymentExceptions",
      (SELECT COUNT(*)::int FROM admission_sync_conflicts WHERE status = 'pending_review') AS "syncConflicts"
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

  const totalPending = pendingSessions + pendingRefunds + failedEmails + paymentExceptions + syncConflicts;

  return {
    pendingSessions,
    pendingRefunds,
    failedEmails,
    paymentExceptions,
    syncConflicts,
    totalPending,
  };
}
