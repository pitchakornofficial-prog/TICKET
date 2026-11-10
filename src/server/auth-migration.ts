import { getMigrations } from 'better-auth/db/migration';
import type { Pool } from 'pg';
import { authOptions } from './auth-options.ts';

// Explicit local/operational command only; the web process never runs migrations.
export async function migrateAuth(pool: Pool): Promise<void> {
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [945162001]);
    const plan = await getMigrations(authOptions(pool, {
      baseURL: 'http://127.0.0.1:3000', secret: 'schema-planning-only-not-a-session-secret',
    }));
    await plan.runMigrations();
    const { ensureInvitationSchema } = await import('./invitation.ts');
    await ensureInvitationSchema(pool);
    const { ensureEventSchema } = await import('./events.ts');
    await ensureEventSchema(pool);
    const { ensureScannerScopeSchema } = await import('./scanner-scope.ts');
    await ensureScannerScopeSchema(pool);
    const { ensureReservationSchema } = await import('./reservation.ts');
    await ensureReservationSchema(pool);
    const { ensureTicketSchema } = await import('./tickets.ts');
    await ensureTicketSchema(pool);
    const { ensureAdmissionSchema } = await import('./admission.ts');
    await ensureAdmissionSchema(pool);
    const { ensureRefundSchema } = await import('./refunds.ts');
    await ensureRefundSchema(pool);
    const { ensureReportSchema } = await import('./reports.ts');
    await ensureReportSchema(pool);
    const { ensureNewsSchema } = await import('./news.ts');
    await ensureNewsSchema(pool);
    const { ensureContactAuditSchema } = await import('./contact-correction.ts');
    await ensureContactAuditSchema(pool);
    const { ensureTicketDeliverySchema } = await import('./ticket-delivery.ts');
    await ensureTicketDeliverySchema(pool);
    const { ensurePrimaryScannerSchema } = await import('./primary-scanner.ts');
    await ensurePrimaryScannerSchema(pool);
    const { ensureUploadQuotaSchema } = await import('./upload-quota.ts');
    await ensureUploadQuotaSchema(pool);
  } finally {
    try { await lock.query('SELECT pg_advisory_unlock($1)', [945162001]); }
    finally { lock.release(); }
  }
}
