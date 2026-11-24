import type { Pool } from 'pg';
import { ensureEventSchema } from './events';

export interface EventAuditLogRecord {
  id: string;
  eventId: string;
  editorUserId: string;
  editorName: string;
  changesSummary: string[];
  snapshotCsv: string | null;
  createdAt: string;
}

const eventAuditSchemaReady = new WeakMap<Pool, Promise<void>>();

export async function ensureEventAuditSchema(pool: Pool): Promise<void> {
  let promise = eventAuditSchemaReady.get(pool);
  if (!promise) {
    promise = (async () => {
      await ensureEventSchema(pool);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS event_audit_logs (
          id TEXT PRIMARY KEY,
          "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          "editorUserId" TEXT NOT NULL,
          "editorName" TEXT NOT NULL,
          "changesSummary" JSONB NOT NULL,
          "snapshotCsv" TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_event_audit_logs_eventId ON event_audit_logs("eventId");
        CREATE INDEX IF NOT EXISTS idx_event_audit_logs_createdAt ON event_audit_logs("createdAt" DESC);
      `);
    })().catch((err) => {
      eventAuditSchemaReady.delete(pool);
      throw err;
    });
    eventAuditSchemaReady.set(pool, promise);
  }
  await promise;
}

export async function recordEventAuditLog(
  pool: Pool,
  data: {
    id?: string;
    eventId: string;
    editorUserId: string;
    editorName: string;
    changesSummary: string[];
    snapshotCsv?: string | null;
  },
): Promise<EventAuditLogRecord> {
  await ensureEventAuditSchema(pool);
  const logId = data.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const snapshot = data.snapshotCsv || null;
  const summaryJson = JSON.stringify(data.changesSummary || []);

  const res = await pool.query(
    `INSERT INTO event_audit_logs (
       id, "eventId", "editorUserId", "editorName", "changesSummary", "snapshotCsv", "createdAt"
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())
     RETURNING id, "eventId", "editorUserId", "editorName", "changesSummary", "snapshotCsv", "createdAt"`,
    [logId, data.eventId, data.editorUserId, data.editorName, summaryJson, snapshot],
  );

  const row = res.rows[0];
  return {
    id: row.id,
    eventId: row.eventId,
    editorUserId: row.editorUserId,
    editorName: row.editorName,
    changesSummary: Array.isArray(row.changesSummary) ? row.changesSummary : [],
    snapshotCsv: row.snapshotCsv,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export async function getEventAuditLogs(
  pool: Pool,
  eventId: string,
): Promise<EventAuditLogRecord[]> {
  await ensureEventAuditSchema(pool);
  const res = await pool.query(
    `SELECT id, "eventId", "editorUserId", "editorName", "changesSummary", "snapshotCsv", "createdAt"
     FROM event_audit_logs
     WHERE "eventId" = $1
     ORDER BY "createdAt" DESC
     LIMIT 100`,
    [eventId],
  );

  return res.rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    editorUserId: row.editorUserId,
    editorName: row.editorName,
    changesSummary: Array.isArray(row.changesSummary) ? row.changesSummary : [],
    snapshotCsv: row.snapshotCsv,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }));
}
