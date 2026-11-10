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

    // 1. Expire stale entries
    await pool.query(
      `UPDATE event_queue_entries
       SET status = 'expired', "updatedAt" = now()
       WHERE "eventId" = $1 AND status IN ('active', 'waiting') AND "expiresAt" < now()`,
      [eventId],
    );

    // 2. Count active entries
    const activeRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM event_queue_entries WHERE "eventId" = $1 AND status = 'active'`,
      [eventId],
    );
    let activeCount = activeRes.rows[0]?.count ?? 0;

    // 3. If token provided, check existing entry
    if (entryToken) {
      const existingEntryRes = await pool.query(
        `SELECT id, "queueNumber", status, "expiresAt" FROM event_queue_entries WHERE id = $1 AND "eventId" = $2`,
        [entryToken, eventId],
      );
      const existingEntry = existingEntryRes.rows[0];

      if (existingEntry) {
        if (existingEntry.status === 'active') {
          return {
            allowed: true,
            queueNumber: existingEntry.queueNumber,
            peopleAhead: 0,
            capacity: QUEUE_CAPACITY,
            activeCount,
            status: 'active',
            token: existingEntry.id,
            estimatedSeconds: 0,
          };
        }

        if (existingEntry.status === 'waiting') {
          // Check if slots are available to promote waiting users
          if (activeCount < QUEUE_CAPACITY) {
            const availableSlots = QUEUE_CAPACITY - activeCount;
            const promoteRes = await pool.query(
              `WITH candidates AS (
                 SELECT id FROM event_queue_entries
                 WHERE "eventId" = $1 AND status = 'waiting'
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
            if (promotedIds.has(existingEntry.id)) {
              return {
                allowed: true,
                queueNumber: existingEntry.queueNumber,
                peopleAhead: 0,
                capacity: QUEUE_CAPACITY,
                activeCount: activeCount + promoteRes.rowCount,
                status: 'active',
                token: existingEntry.id,
                estimatedSeconds: 0,
              };
            }
            activeCount += promoteRes.rowCount;
          }

          // Still waiting: calculate people ahead
          const aheadRes = await pool.query(
            `SELECT COUNT(*)::int AS count FROM event_queue_entries
             WHERE "eventId" = $1 AND status = 'waiting' AND "queueNumber" < $2`,
            [eventId, existingEntry.queueNumber],
          );
          const peopleAhead = aheadRes.rows[0]?.count ?? 0;

          return {
            allowed: false,
            queueNumber: existingEntry.queueNumber,
            peopleAhead,
            capacity: QUEUE_CAPACITY,
            activeCount,
            status: 'waiting',
            token: existingEntry.id,
            estimatedSeconds: peopleAhead * 2,
          };
        }
      }
    }

    // 4. Create new entry
    const maxNumRes = await pool.query(
      `SELECT COALESCE(MAX("queueNumber"), 0)::int + 1 AS next_num FROM event_queue_entries WHERE "eventId" = $1`,
      [eventId],
    );
    const nextQueueNumber = maxNumRes.rows[0]?.next_num ?? 1;
    const newToken = `qtok_${randomUUID()}`;

    if (activeCount < QUEUE_CAPACITY) {
      // First 200 users: granted immediate active entry
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

    // User 201 onwards: added to waiting queue
    await pool.query(
      `INSERT INTO event_queue_entries (id, "eventId", "queueNumber", status, "expiresAt")
       VALUES ($1, $2, $3, 'waiting', now() + INTERVAL '30 minutes')`,
      [newToken, eventId, nextQueueNumber],
    );

    const aheadRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM event_queue_entries
       WHERE "eventId" = $1 AND status = 'waiting' AND "queueNumber" < $2`,
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
  } catch {
    // Graceful in-memory fallback if database is not reachable
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

export async function completeQueueEntry(pool: Pool, eventId: string, entryToken: string): Promise<void> {
  try {
    await ensureQueueSchema(pool);
    await pool.query(
      `UPDATE event_queue_entries
       SET status = 'completed', "updatedAt" = now()
       WHERE id = $1 AND "eventId" = $2`,
      [entryToken, eventId],
    );

    // Promote next waiting user if slot is freed
    const activeRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM event_queue_entries WHERE "eventId" = $1 AND status = 'active'`,
      [eventId],
    );
    const activeCount = activeRes.rows[0]?.count ?? 0;
    if (activeCount < QUEUE_CAPACITY) {
      await pool.query(
        `WITH next_entry AS (
           SELECT id FROM event_queue_entries
           WHERE "eventId" = $1 AND status = 'waiting'
           ORDER BY "queueNumber" ASC
           LIMIT 1
         )
         UPDATE event_queue_entries
         SET status = 'active',
             "expiresAt" = now() + INTERVAL '15 minutes',
             "updatedAt" = now()
         WHERE id IN (SELECT id FROM next_entry)`,
        [eventId],
      );
    }
  } catch {
    // ignore complete failure on fallback
  }
}
