import type { Pool } from 'pg';
import { inTransaction } from './database.ts';
import type { TicketDesignerState } from '../lib/ticket-master-template-sync.ts';

export function parseTicketMasterTemplate(input: unknown): TicketDesignerState | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (typeof data.presetId !== 'string') return null;
  if (!data.elements || typeof data.elements !== 'object' || Array.isArray(data.elements)) return null;
  return data as unknown as TicketDesignerState;
}

export async function ensureTicketMasterTemplateSchema(pool: Pool): Promise<void> {
  await inTransaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [945162035]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS owner_ticket_master_template (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
        data JSONB NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  });
}

export async function readTicketMasterTemplate(pool: Pool): Promise<TicketDesignerState | null> {
  await ensureTicketMasterTemplateSchema(pool);
  const result = await pool.query('SELECT data FROM owner_ticket_master_template WHERE id = TRUE');
  return result.rows[0] ? parseTicketMasterTemplate(result.rows[0].data) : null;
}

export async function writeTicketMasterTemplate(pool: Pool, data: TicketDesignerState): Promise<void> {
  await ensureTicketMasterTemplateSchema(pool);
  await pool.query(
    `INSERT INTO owner_ticket_master_template (id, data, "updatedAt")
     VALUES (TRUE, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now()`,
    [JSON.stringify(data)],
  );
}
