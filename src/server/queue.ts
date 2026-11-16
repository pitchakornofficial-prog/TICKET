import { createHmac, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from './database.ts';

export const QUEUE_CAPACITY = 200;
export const QUEUE_HOLD_MINUTES = 15;
export const QUEUE_ADMISSION_LOCK_NAMESPACE = 781204115;
const QUEUE_SESSION_LIMIT = 4;
const QUEUE_IP_LIMIT = 25;

export interface QueueStatusResult {
  allowed: boolean;
  queueNumber: number;
  peopleAhead: number;
  capacity: number;
  activeCount: number;
  status: 'active' | 'waiting' | 'expired' | 'completed';
  token: string;
  estimatedSeconds: number;
}

export class QueueRateLimitedError extends Error {
  constructor() {
    super('ระบบคิวได้รับคำขอใหม่มากเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง');
    this.name = 'QueueRateLimitedError';
  }
}

const queueSchemaPromises = new WeakMap<Pool, Promise<void>>();

function queueHash(value: string): string {
  const secret = process.env.QUEUE_TOKEN_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (secret && secret.length >= 32) {
    return createHmac('sha256', secret).update(value).digest('hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('QUEUE_TOKEN_SECRET or BETTER_AUTH_SECRET must contain at least 32 characters');
  }
  return createHmac('sha256', secret || 'ticket-local-queue-cookie-secret').update(value).digest('hex');
}

export async function ensureQueueSchema(pool: Pool): Promise<void> {
  const existing = queueSchemaPromises.get(pool);
  if (existing) return existing;

  const promise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_queue_entries (
        id TEXT PRIMARY KEY,
        "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        "queueNumber" INT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "sessionHash" TEXT,
        "ipHash" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE event_queue_entries ADD COLUMN IF NOT EXISTS "sessionHash" TEXT;
      ALTER TABLE event_queue_entries ADD COLUMN IF NOT EXISTS "ipHash" TEXT;
      CREATE INDEX IF NOT EXISTS idx_event_queue_entries_event_status
        ON event_queue_entries("eventId", status, "expiresAt");
      CREATE INDEX IF NOT EXISTS idx_event_queue_entries_queue_num
        ON event_queue_entries("eventId", "queueNumber");
      CREATE INDEX IF NOT EXISTS idx_event_queue_entries_active
        ON event_queue_entries("eventId", "expiresAt") WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS idx_event_queue_entries_waiting
        ON event_queue_entries("eventId", "queueNumber") WHERE status = 'waiting';

      CREATE TABLE IF NOT EXISTS event_queue_rate_limits (
        "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        "keyType" TEXT NOT NULL CHECK ("keyType" IN ('ip', 'session')),
        "keyHash" TEXT NOT NULL,
        "windowStartedAt" TIMESTAMPTZ NOT NULL,
        count INT NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("eventId", "keyType", "keyHash")
      );
      CREATE INDEX IF NOT EXISTS idx_event_queue_rate_limits_updated
        ON event_queue_rate_limits("updatedAt");
    `);
  })().catch(error => {
    queueSchemaPromises.delete(pool);
    throw error;
  });

  queueSchemaPromises.set(pool, promise);
  return promise;
}

async function lockQueueAdmission(client: Pick<PoolClient, 'query'>, eventId: string): Promise<void> {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), $2::int)',
    [eventId, QUEUE_ADMISSION_LOCK_NAMESPACE],
  );
}

async function incrementRate(
  client: Pick<PoolClient, 'query'>,
  eventId: string,
  keyType: 'ip' | 'session',
  keyHash: string,
): Promise<number> {
  const result = await client.query<{ count: number }>(
    `INSERT INTO event_queue_rate_limits ("eventId", "keyType", "keyHash", "windowStartedAt", count)
     VALUES ($1, $2, $3, now(), 1)
     ON CONFLICT ("eventId", "keyType", "keyHash") DO UPDATE SET
       count = CASE
         WHEN event_queue_rate_limits."windowStartedAt" <= now() - INTERVAL '1 minute' THEN 1
         ELSE event_queue_rate_limits.count + 1
       END,
       "windowStartedAt" = CASE
         WHEN event_queue_rate_limits."windowStartedAt" <= now() - INTERVAL '1 minute' THEN now()
         ELSE event_queue_rate_limits."windowStartedAt"
       END,
       "updatedAt" = now()
     RETURNING count`,
    [eventId, keyType, keyHash],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function enforceQueueCreationRate(
  client: Pick<PoolClient, 'query'>,
  eventId: string,
  sessionId: string,
  clientIp: string | null | undefined,
): Promise<{ sessionHash: string; ipHash: string | null }> {
  const sessionHash = queueHash(`session:${sessionId}`);
  const ipHash = clientIp ? queueHash(`ip:${clientIp}`) : null;
  const sessionCount = await incrementRate(client, eventId, 'session', sessionHash);
  if (sessionCount > QUEUE_SESSION_LIMIT) throw new QueueRateLimitedError();
  if (ipHash) {
    const ipCount = await incrementRate(client, eventId, 'ip', ipHash);
    if (ipCount > QUEUE_IP_LIMIT) throw new QueueRateLimitedError();
  }
  await client.query(`DELETE FROM event_queue_rate_limits WHERE "updatedAt" < now() - INTERVAL '1 day'`);
  return { sessionHash, ipHash };
}

async function countActive(client: Pick<PoolClient, 'query'>, eventId: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM event_queue_entries
     WHERE "eventId" = $1 AND status = 'active' AND "expiresAt" >= now()`,
    [eventId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function promoteWaiting(client: Pick<PoolClient, 'query'>, eventId: string, slots: number): Promise<string[]> {
  if (slots <= 0) return [];
  const result = await client.query<{ id: string }>(
    `WITH candidates AS (
       SELECT id FROM event_queue_entries
       WHERE "eventId" = $1 AND status = 'waiting' AND "expiresAt" >= now()
       ORDER BY "queueNumber" ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE event_queue_entries q
     SET status = 'active', "expiresAt" = now() + INTERVAL '15 minutes', "updatedAt" = now()
     FROM candidates c
     WHERE q.id = c.id
     RETURNING q.id`,
    [eventId, slots],
  );
  return result.rows.map(row => row.id);
}

export async function getOrCreateQueueEntry(
  pool: Pool,
  eventId: string,
  entryToken?: string | null,
  context: { sessionId?: string | null; clientIp?: string | null } = {},
): Promise<QueueStatusResult> {
  try {
    await ensureQueueSchema(pool);
    return await inTransaction(pool, async client => {
      await lockQueueAdmission(client, eventId);
      await client.query(
        `UPDATE event_queue_entries SET status = 'expired', "updatedAt" = now()
         WHERE "eventId" = $1 AND status IN ('active', 'waiting') AND "expiresAt" < now()`,
        [eventId],
      );

      if (entryToken) {
        const entryRes = await client.query<{
          id: string;
          queueNumber: number;
          status: string;
          expiresAt: Date;
        }>(
          `SELECT id, "queueNumber", status, "expiresAt"
           FROM event_queue_entries WHERE id = $1 AND "eventId" = $2 FOR UPDATE`,
          [entryToken, eventId],
        );
        const entry = entryRes.rows[0];
        let activeCount = await countActive(client, eventId);
        if (entry?.expiresAt && new Date(entry.expiresAt) >= new Date()) {
          if (entry.status === 'active') {
            return {
              allowed: true,
              queueNumber: entry.queueNumber,
              peopleAhead: 0,
              capacity: QUEUE_CAPACITY,
              activeCount,
              status: 'active',
              token: entry.id,
              estimatedSeconds: 0,
            };
          }
          if (entry.status === 'waiting') {
            const promoted = await promoteWaiting(client, eventId, QUEUE_CAPACITY - activeCount);
            activeCount += promoted.length;
            if (promoted.includes(entry.id)) {
              return {
                allowed: true,
                queueNumber: entry.queueNumber,
                peopleAhead: 0,
                capacity: QUEUE_CAPACITY,
                activeCount,
                status: 'active',
                token: entry.id,
                estimatedSeconds: 0,
              };
            }
            const aheadRes = await client.query<{ count: number }>(
              `SELECT COUNT(*)::int AS count FROM event_queue_entries
               WHERE "eventId" = $1 AND status = 'waiting' AND "expiresAt" >= now() AND "queueNumber" < $2`,
              [eventId, entry.queueNumber],
            );
            const peopleAhead = Number(aheadRes.rows[0]?.count ?? 0);
            return {
              allowed: false,
              queueNumber: entry.queueNumber,
              peopleAhead,
              capacity: QUEUE_CAPACITY,
              activeCount,
              status: 'waiting',
              token: entry.id,
              estimatedSeconds: peopleAhead * 2,
            };
          }
        }
      }

      const sessionId = context.sessionId || randomUUID();
      const { sessionHash, ipHash } = await enforceQueueCreationRate(
        client,
        eventId,
        sessionId,
        context.clientIp,
      );
      const activeCount = await countActive(client, eventId);
      const nextRes = await client.query<{ nextNum: number }>(
        `SELECT COALESCE(MAX("queueNumber"), 0)::int + 1 AS "nextNum"
         FROM event_queue_entries WHERE "eventId" = $1`,
        [eventId],
      );
      const queueNumber = Number(nextRes.rows[0]?.nextNum ?? 1);
      const token = `qtok_${randomUUID()}`;
      const status = activeCount < QUEUE_CAPACITY ? 'active' : 'waiting';
      await client.query(
        `INSERT INTO event_queue_entries (
           id, "eventId", "queueNumber", status, "expiresAt", "sessionHash", "ipHash"
         ) VALUES ($1, $2, $3, $4,
           now() + CASE WHEN $4 = 'active' THEN INTERVAL '15 minutes' ELSE INTERVAL '30 minutes' END,
           $5, $6)`,
        [token, eventId, queueNumber, status, sessionHash, ipHash],
      );

      if (status === 'active') {
        return {
          allowed: true,
          queueNumber,
          peopleAhead: 0,
          capacity: QUEUE_CAPACITY,
          activeCount: activeCount + 1,
          status,
          token,
          estimatedSeconds: 0,
        };
      }

      const aheadRes = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM event_queue_entries
         WHERE "eventId" = $1 AND status = 'waiting' AND "expiresAt" >= now() AND "queueNumber" < $2`,
        [eventId, queueNumber],
      );
      const peopleAhead = Number(aheadRes.rows[0]?.count ?? 0);
      return {
        allowed: false,
        queueNumber,
        peopleAhead,
        capacity: QUEUE_CAPACITY,
        activeCount,
        status,
        token,
        estimatedSeconds: peopleAhead * 2,
      };
    });
  } catch (error) {
    if (error instanceof QueueRateLimitedError || process.env.NODE_ENV === 'production') throw error;
    return {
      allowed: true,
      queueNumber: 1,
      peopleAhead: 0,
      capacity: QUEUE_CAPACITY,
      activeCount: 1,
      status: 'active',
      token: entryToken || `qtok_fallback_${randomUUID()}`,
      estimatedSeconds: 0,
    };
  }
}

export async function verifyQueueAccess(
  pool: Pool,
  eventId: string,
  entryToken?: string | null,
): Promise<boolean> {
  try {
    await ensureQueueSchema(pool);
    if (entryToken) {
      const entryRes = await pool.query<{ status: string; expiresAt: Date }>(
        `SELECT status, "expiresAt" FROM event_queue_entries WHERE id = $1 AND "eventId" = $2`,
        [entryToken, eventId],
      );
      const entry = entryRes.rows[0];
      if (entry && entry.status === 'active' && new Date(entry.expiresAt) > new Date()) return true;
    }
    return (await countActive(pool, eventId)) < QUEUE_CAPACITY;
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
}

export async function completeQueueEntry(pool: Pool, eventId: string, entryToken: string): Promise<void> {
  try {
    await ensureQueueSchema(pool);
    await inTransaction(pool, async client => {
      await lockQueueAdmission(client, eventId);
      await client.query(
        `UPDATE event_queue_entries SET status = 'completed', "updatedAt" = now()
         WHERE id = $1 AND "eventId" = $2 AND status = 'active'`,
        [entryToken, eventId],
      );
      const activeCount = await countActive(client, eventId);
      await promoteWaiting(client, eventId, QUEUE_CAPACITY - activeCount);
    });
  } catch {
    // A completed checkout remains valid even if its queue pass cannot be marked complete.
  }
}
