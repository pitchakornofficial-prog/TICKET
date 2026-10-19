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
  } finally {
    try { await lock.query('SELECT pg_advisory_unlock($1)', [945162001]); }
    finally { lock.release(); }
  }
}
