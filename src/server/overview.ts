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

  const [
    sessionsRes,
    amendmentsRes,
    cancellationsRes,
    refundsRes,
    emailsRes,
    paymentsRes,
    conflictsRes,
  ] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM event_sessions WHERE status = 'pending_approval'`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM session_amendments WHERE status = 'pending'`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM session_cancellations WHERE status = 'pending'`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM refund_requests WHERE status = 'pending'`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM ticket_email_deliveries WHERE status = 'failed'`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM payment_recovery_cases WHERE status = 'pending_review'`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM admission_sync_conflicts WHERE status = 'pending_review'`),
  ]);

  const pendingSessions =
    Number(sessionsRes.rows[0]?.count || 0) +
    Number(amendmentsRes.rows[0]?.count || 0) +
    Number(cancellationsRes.rows[0]?.count || 0);

  const pendingRefunds = Number(refundsRes.rows[0]?.count || 0);
  const failedEmails = Number(emailsRes.rows[0]?.count || 0);
  const paymentExceptions = Number(paymentsRes.rows[0]?.count || 0);
  const syncConflicts = Number(conflictsRes.rows[0]?.count || 0);

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
