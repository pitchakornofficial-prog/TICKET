import type { Pool } from 'pg';
import { inTransaction } from './database';

export const CONTACT_FIELDS = [
  'hotline', 'hotlineBadge', 'hotlineNote', 'email', 'emailBadge', 'emailNote',
  'lineId', 'lineBadge', 'lineNote', 'operatingHours', 'operatingHoursNote', 'address', 'addressNote',
] as const;
export type SharedContactInfo = Record<(typeof CONTACT_FIELDS)[number], string>;

export function parseContactInfo(input: unknown): SharedContactInfo | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (CONTACT_FIELDS.some(key => typeof data[key] !== 'string' || (data[key] as string).length > 1000)) return null;
  return Object.fromEntries(CONTACT_FIELDS.map(key => [key, (data[key] as string).trim()])) as SharedContactInfo;
}

async function ensureSchema(pool: Pool) {
  await inTransaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [945162032]);
    await client.query('CREATE TABLE IF NOT EXISTS owner_contact_info (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id), data JSONB NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  });
}

export async function readOwnerContactInfo(pool: Pool): Promise<SharedContactInfo | null> {
  await ensureSchema(pool);
  const result = await pool.query('SELECT data FROM owner_contact_info WHERE id = TRUE');
  return result.rows[0] ? parseContactInfo(result.rows[0].data) : null;
}

export async function writeOwnerContactInfo(pool: Pool, data: SharedContactInfo): Promise<void> {
  await ensureSchema(pool);
  await pool.query('INSERT INTO owner_contact_info (id, data) VALUES (TRUE, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now()', [JSON.stringify(data)]);
}
