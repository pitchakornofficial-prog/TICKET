import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export const QUEUE_CAPACITY = 200; // D-271: First 200 users enter directly without queue
export const QUEUE_HOLD_MINUTES = 15; // 15-minute checkout hold window

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

const queueSchemaPromises = new WeakMap<Pool, Promise<void>>();

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
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_event_queue_entries_event_status 
        ON event_queue_entries("eventId", status, "expiresAt");
      CREATE INDEX IF NOT EXISTS idx_event_queue_entries_queue_num 
        ON event_queue_entries("eventId", "queueNumber");
      CREATE INDEX IF NOT EXISTS idx_event_queue_entries_active
        ON event_queue_entries("eventId", "expiresAt")
        WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS idx_event_queue_entries_waiting
        ON event_queue_entries("eventId", "queueNumber")
        WHERE status = 'waiting';
    `);
  })().catch(err => {
    queueSchemaPromises.delete(pool);
    throw err;
  });

  queueSchemaPromises.set(pool, promise);
  return promise;
}

export async function getOrCreateQueueEntry(
  pool: Pool,
  eventId: string,
  entryToken?: string | null,
): Promise<QueueStatusResult> {
  try {
    await ensureQueueSchema(pool);

    let activeCount = 0;

    // 1. Fast path when token is provided: check entry + active count in one query
    if (entryToken) {
      const checkRes = await pool.query<{
        active_count: number;
        id: string | null;
        queueNumber: number | null;
        status: string | null;
        expiresAt: Date | null;
      }>(
        `SELECT
           (SELECT COUNT(*)::int FROM event_queue_entries WHERE "eventId" = $1 AND status = 'active' AND "expiresAt" >= now()) AS active_count,
           e.id, e."queueNumber", e.status, e."expiresAt"
         FROM (SELECT 1) AS dummy
         LEFT JOIN event_queue_entries e ON e.id = $2 AND e."eventId" = $1`,
        [eventId, entryToken],
      );
      const row = checkRes.rows[0];
      activeCount = row?.active_count ?? 0;

      if (row?.id && row.status === 'active' && row.expiresAt && new Date(row.expiresAt) >= new Date()) {
        return {
          allowed: true,
          queueNumber: row.queueNumber ?? 1,
          peopleAhead: 0,
          capacity: QUEUE_CAPACITY,
          activeCount,
          status: 'active',
          token: row.id,
          estimatedSeconds: 0,
        };
      }

      if (row?.id && row.status === 'waiting' && row.expiresAt && new Date(row.expiresAt) >= new Date()) {
        if (activeCount >= QUEUE_CAPACITY) {
          // Expire stale entries only when capacity appears full
          await pool.query(
            `UPDATE event_queue_entries
             SET status = 'expired', "updatedAt" = now()
             WHERE "eventId" = $1 AND status IN ('active', 'waiting') AND "expiresAt" < now()`,
            [eventId],
          );
          const recountRes = await pool.query(
            `SELECT COUNT(*)::int AS count FROM event_queue_entries WHERE "eventId" = $1 AND status = 'active'`,
            [eventId],
          );
          activeCount = recountRes.rows[0]?.count ?? 0;
        }

        if (activeCount < QUEUE_CAPACITY) {
          const availableSlots = QUEUE_CAPACITY - activeCount;
          const promoteRes = await pool.query(
            `WITH candidates AS (
               SELECT id FROM event_queue_entries
               WHERE "eventId" = $1 AND status = 'waiting' AND "expiresAt" >= now()
               ORDER BY "queueNumber" ASC
               LIMIT $2
             )
             UPDATE event_queue_entries
             SET status = 'active',
                 "expiresAt" = now() + INTERVAL '15 minutes',
                 "updatedAt" = now()
             WHERE id IN (SELECT id FROM candidates)
             RETURNING id`,
            [eventId, availableSlots],
          );

          const promotedIds = new Set(promoteRes.rows.map((r: { id: string }) => r.id));
          if (promotedIds.has(row.id)) {
            return {
              allowed: true,
              queueNumber: row.queueNumber ?? 1,
              peopleAhead: 0,
              capacity: QUEUE_CAPACITY,
              activeCount: activeCount + (promoteRes.rowCount ?? 0),
              status: 'active',
              token: row.id,
              estimatedSeconds: 0,
            };
          }
          activeCount += promoteRes.rowCount ?? 0;
        }

        const aheadRes = await pool.query(
          `SELECT COUNT(*)::int AS count FROM event_queue_entries
           WHERE "eventId" = $1 AND status = 'waiting' AND "expiresAt" >= now() AND "queueNumber" < $2`,
          [eventId, row.queueNumber],
        );
        const peopleAhead = aheadRes.rows[0]?.count ?? 0;

        return {
          allowed: false,
          queueNumber: row.queueNumber ?? 1,
          peopleAhead,
          capacity: QUEUE_CAPACITY,
          activeCount,
          status: 'waiting',
          token: row.id,
          estimatedSeconds: peopleAhead * 2,
        };
      }
    }

    // 2. Create new entry: check capacity and insert active entry in a single round-trip when slots are available
    const newToken = `qtok_${randomUUID()}`;
    const fastCreateRes = await pool.query<{ active_count: number; next_num: number; insertedNum: number | null }>(
      `WITH counts AS (
         SELECT
           (SELECT COUNT(*)::int FROM event_queue_entries WHERE "eventId" = $1 AND status = 'active' AND "expiresAt" >= now()) AS active_count,
           COALESCE((SELECT MAX("queueNumber") FROM event_queue_entries WHERE "eventId" = $1), 0)::int + 1 AS next_num
       ),
       ins AS (
         INSERT INTO event_queue_entries (id, "eventId", "queueNumber", status, "expiresAt")
         SELECT $2, $1, counts.next_num, 'active', now() + INTERVAL '15 minutes'
         FROM counts
         WHERE counts.active_count < $3
         RETURNING "queueNumber"
       )
       SELECT counts.active_count, counts.next_num, ins."queueNumber" AS "insertedNum"
       FROM counts
       LEFT JOIN ins ON TRUE`,
      [eventId, newToken, QUEUE_CAPACITY],
    );
    activeCount = fastCreateRes.rows[0]?.active_count ?? 0;
    const nextQueueNumber = fastCreateRes.rows[0]?.next_num ?? 1;
    if (fastCreateRes.rows[0]?.insertedNum != null) {
      return {
        allowed: true,
        queueNumber: fastCreateRes.rows[0].insertedNum,
        peopleAhead: 0,
        capacity: QUEUE_CAPACITY,
        activeCount: activeCount + 1,
        status: 'active',
        token: newToken,
        estimatedSeconds: 0,
      };
    }

    if (activeCount >= QUEUE_CAPACITY) {
      await pool.query(
        `UPDATE event_queue_entries
         SET status = 'expired', "updatedAt" = now()
         WHERE "eventId" = $1 AND status IN ('active', 'waiting') AND "expiresAt" < now()`,
        [eventId],
      );
      const recountRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM event_queue_entries WHERE "eventId" = $1 AND status = 'active'`,
        [eventId],
      );
      activeCount = recountRes.rows[0]?.count ?? 0;
    }

    if (activeCount < QUEUE_CAPACITY) {
      await pool.query(
        `INSERT INTO event_queue_entries (id, "eventId", "queueNumber", status, "expiresAt")
         VALUES ($1, $2, $3, 'active', now() + INTERVAL '15 minutes')`,
        [newToken, eventId, nextQueueNumber],
      );

      return {
        allowed: true,
        queueNumber: nextQueueNumber,
        peopleAhead: 0,
        capacity: QUEUE_CAPACITY,
        activeCount: activeCount + 1,
        status: 'active',
        token: newToken,
        estimatedSeconds: 0,
      };
    }

    await pool.query(
      `INSERT INTO event_queue_entries (id, "eventId", "queueNumber", status, "expiresAt")
       VALUES ($1, $2, $3, 'waiting', now() + INTERVAL '30 minutes')`,
      [newToken, eventId, nextQueueNumber],
    );

    const aheadRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM event_queue_entries
       WHERE "eventId" = $1 AND status = 'waiting' AND "expiresAt" >= now() AND "queueNumber" < $2`,
      [eventId, nextQueueNumber],
    );
    const peopleAhead = aheadRes.rows[0]?.count ?? 0;

    return {
      allowed: false,
      queueNumber: nextQueueNumber,
      peopleAhead,
      capacity: QUEUE_CAPACITY,
      activeCount,
      status: 'waiting',
      token: newToken,
      estimatedSeconds: peopleAhead * 2,
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    // Graceful in-memory fallback only outside production when database is not reachable
    const fallbackNum = 1;
    return {
      allowed: true,
      queueNumber: fallbackNum,
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

    // Fast path: valid active token avoids full queue expiration/count scan
    if (entryToken) {
      const entryRes = await pool.query(
        `SELECT status, "expiresAt" FROM event_queue_entries WHERE id = $1 AND "eventId" = $2`,
        [entryToken, eventId],
      );
      const entry = entryRes.rows[0];
      if (entry && entry.status === 'active' && new Date(entry.expiresAt) > new Date()) {
        return true;
      }
    }

    const activeRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM event_queue_entries WHERE "eventId" = $1 AND status = 'active' AND "expiresAt" >= now()`,
      [eventId],
    );
    let activeCount = activeRes.rows[0]?.count ?? 0;

    if (activeCount < QUEUE_CAPACITY) {
      return true;
    }

    await pool.query(
      `UPDATE event_queue_entries
       SET status = 'expired', "updatedAt" = now()
       WHERE "eventId" = $1 AND status IN ('active', 'waiting') AND "expiresAt" < now()`,
      [eventId],
    );

    const recountRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM event_queue_entries WHERE "eventId" = $1 AND status = 'active'`,
      [eventId],
    );
    activeCount = recountRes.rows[0]?.count ?? 0;

    return activeCount < QUEUE_CAPACITY;
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
}

export async function completeQueueEntry(pool: Pool, eventId: string, entryToken: string): Promise<void> {
  try {
    await ensureQueueSchema(pool);
    const completedRes = await pool.query<{ hasWaiting: boolean }>(
      `UPDATE event_queue_entries
       SET status = 'completed', "updatedAt" = now()
       WHERE id = $1 AND "eventId" = $2
       RETURNING EXISTS(
         SELECT 1 FROM event_queue_entries
         WHERE "eventId" = $2 AND status = 'waiting' AND "expiresAt" >= now()
       ) AS "hasWaiting"`,
      [entryToken, eventId],
    );

    if (!completedRes.rows[0]?.hasWaiting) {
      return;
    }

    // Promote next waiting user if slot is freed
    await pool.query(
      `WITH next_entry AS (
         SELECT id FROM event_queue_entries
         WHERE "eventId" = $1
           AND status = 'waiting'
           AND "expiresAt" >= now()
           AND (SELECT COUNT(*)::int FROM event_queue_entries WHERE "eventId" = $1 AND status = 'active' AND "expiresAt" >= now()) < $2
         ORDER BY "queueNumber" ASC
         LIMIT 1
       )
       UPDATE event_queue_entries
       SET status = 'active',
           "expiresAt" = now() + INTERVAL '15 minutes',
           "updatedAt" = now()
       WHERE id IN (SELECT id FROM next_entry)`,
      [eventId, QUEUE_CAPACITY],
    );
  } catch {
    // ignore complete failure on fallback
  }
}
