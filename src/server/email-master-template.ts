import type { Pool } from 'pg';
import { inTransaction } from './database.ts';
import {
  DEFAULT_EMAIL_MASTER_TEMPLATE,
  INITIAL_EMAIL_PRESETS,
  EMAIL_SCENARIOS,
  type EmailScenarioKey,
  type EmailTemplateState,
  type EmailMasterTemplatePayload,
  parseEmailMasterPayload,
} from '../lib/email-template.ts';

export * from '../lib/email-template.ts';

export async function ensureEmailMasterTemplateSchema(pool: Pool): Promise<void> {
  await inTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [945162036]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS owner_email_master_template (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
        data JSONB NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  });
}

export async function readEmailMasterPayload(pool: Pool): Promise<EmailMasterTemplatePayload> {
  try {
    await ensureEmailMasterTemplateSchema(pool);
    const result = await pool.query('SELECT data FROM owner_email_master_template WHERE id = TRUE');
    if (result.rows[0]) {
      const parsed = parseEmailMasterPayload(result.rows[0].data);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn('Failed to read owner_email_master_template payload, using default:', err);
  }
  return {
    template: DEFAULT_EMAIL_MASTER_TEMPLATE,
    presets: INITIAL_EMAIL_PRESETS,
    activePresetId: INITIAL_EMAIL_PRESETS[0].id,
    scenarioPresets: {
      ticket_delivery: INITIAL_EMAIL_PRESETS,
    },
    scenarioActivePresetIds: {
      ticket_delivery: INITIAL_EMAIL_PRESETS[0].id,
    },
  };
}

export async function readEmailMasterTemplate(pool: Pool): Promise<EmailTemplateState> {
  const payload = await readEmailMasterPayload(pool);
  return payload.template;
}

export async function readScenarioEmailTemplate(
  pool: Pool,
  scenario: EmailScenarioKey,
): Promise<EmailTemplateState> {
  const payload = await readEmailMasterPayload(pool);
  const found = payload.scenarioTemplates?.[scenario];
  if (found) {
    return found;
  }
  if (scenario === 'ticket_delivery') {
    return payload.template;
  }
  const presets = payload.scenarioPresets?.[scenario];
  const activeId = payload.scenarioActivePresetIds?.[scenario];
  if (presets && presets.length > 0) {
    const active = presets.find((p) => p.id === activeId) || presets[0];
    if (active) return active.template;
  }
  return EMAIL_SCENARIOS[scenario]?.defaultTemplate || DEFAULT_EMAIL_MASTER_TEMPLATE;
}

export async function writeEmailMasterTemplate(
  pool: Pool,
  data: EmailTemplateState | EmailMasterTemplatePayload,
): Promise<void> {
  await ensureEmailMasterTemplateSchema(pool);
  let payload: EmailMasterTemplatePayload;
  if ('template' in data && data.template) {
    payload = data as EmailMasterTemplatePayload;
  } else {
    const existing = await readEmailMasterPayload(pool);
    payload = {
      ...existing,
      template: data as EmailTemplateState,
    };
  }

  await pool.query(
    `INSERT INTO owner_email_master_template (id, data, "updatedAt")
     VALUES (TRUE, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now()`,
    [JSON.stringify(payload)],
  );
}
