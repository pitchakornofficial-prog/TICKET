import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { inTransaction } from './database.ts';

export type EventStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled';
export type SessionStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled';

export interface EventDraftInput {
  title: string;
  description?: string;
  location: string;
  posterUrl?: string;
  limitPerOrder?: number;
}

export interface SessionDraftInput {
  startTime: string; // ISO
  endTime: string;   // ISO
  admissionStartTime?: string; // ISO
  admissionEndTime?: string;   // ISO
  ticketTypes: {
    name: string;
    price: number;
    quota: number;
    description?: string;
  }[];
}

export async function ensureEventSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      "organizerId" TEXT NOT NULL REFERENCES auth_user(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL,
      "posterUrl" TEXT,
      "limitPerOrder" INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'draft',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_events_organizerId ON events("organizerId");

    CREATE TABLE IF NOT EXISTS event_sessions (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "startTime" TIMESTAMPTZ NOT NULL,
      "endTime" TIMESTAMPTZ NOT NULL,
      "admissionStartTime" TIMESTAMPTZ,
      "admissionEndTime" TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'draft',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_eventId ON event_sessions("eventId");

    CREATE TABLE IF NOT EXISTS ticket_types (
      id TEXT PRIMARY KEY,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price NUMERIC(12, 2) NOT NULL,
      quota INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_types_sessionId ON ticket_types("sessionId");
  `);
}

export async function createEventDraft(
  pool: Pool,
  organizerId: string,
  eventInput: EventDraftInput,
  sessionsInput: SessionDraftInput[] = [],
) {
  if (!eventInput.title?.trim()) throw new Error('กรุณาระบุชื่องานคอนเสิร์ต');
  if (!eventInput.location?.trim()) throw new Error('กรุณาระบุสถานที่จัดงาน');
  const limit = eventInput.limitPerOrder ?? 4;
  if (limit <= 0) throw new Error('จำกัดการซื้อต่อคำสั่งซื้อต้องมากกว่า 0');

  await ensureEventSchema(pool);

  return inTransaction(pool, async client => {
    const eventId = randomUUID();
    await client.query(
      `INSERT INTO events (id, "organizerId", title, description, location, "posterUrl", "limitPerOrder", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', now(), now())`,
      [
        eventId,
        organizerId,
        eventInput.title.trim(),
        eventInput.description?.trim() || '',
        eventInput.location.trim(),
        eventInput.posterUrl || null,
        limit,
      ],
    );

    for (const session of sessionsInput) {
      const sessionId = randomUUID();
      await client.query(
        `INSERT INTO event_sessions (id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', now(), now())`,
        [
          sessionId,
          eventId,
          new Date(session.startTime),
          new Date(session.endTime),
          session.admissionStartTime ? new Date(session.admissionStartTime) : null,
          session.admissionEndTime ? new Date(session.admissionEndTime) : null,
        ],
      );

      for (const tt of session.ticketTypes) {
        if (tt.quota < 0) throw new Error('จำนวนบัตรต้องไม่ติดลบ');
        if (tt.price < 0) throw new Error('ราคาบัตรต้องไม่ติดลบ');
        const ttId = randomUUID();
        await client.query(
          `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
          [ttId, sessionId, tt.name.trim(), tt.price, tt.quota, tt.description || ''],
        );
      }
    }

    return getEventDetails(client, eventId, organizerId);
  });
}

export async function updateEventDraft(
  pool: Pool,
  eventId: string,
  organizerId: string,
  eventInput: Partial<EventDraftInput>,
  sessionsInput?: SessionDraftInput[],
) {
  await ensureEventSchema(pool);

  return inTransaction(pool, async client => {
    const check = await client.query('SELECT "organizerId", status FROM events WHERE id = $1', [eventId]);
    if (check.rowCount === 0) throw new Error('ไม่พบงานคอนเสิร์ต');
    if (check.rows[0].organizerId !== organizerId) {
      throw new Error('ไม่อนุญาต: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้');
    }

    if (eventInput.title !== undefined) {
      await client.query('UPDATE events SET title = $1, "updatedAt" = now() WHERE id = $2', [eventInput.title.trim(), eventId]);
    }
    if (eventInput.description !== undefined) {
      await client.query('UPDATE events SET description = $1, "updatedAt" = now() WHERE id = $2', [eventInput.description.trim(), eventId]);
    }
    if (eventInput.location !== undefined) {
      await client.query('UPDATE events SET location = $1, "updatedAt" = now() WHERE id = $2', [eventInput.location.trim(), eventId]);
    }
    if (eventInput.posterUrl !== undefined) {
      await client.query('UPDATE events SET "posterUrl" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.posterUrl, eventId]);
    }
    if (eventInput.limitPerOrder !== undefined) {
      await client.query('UPDATE events SET "limitPerOrder" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.limitPerOrder, eventId]);
    }

    if (sessionsInput) {
      // Delete existing draft sessions and replace
      await client.query('DELETE FROM event_sessions WHERE "eventId" = $1 AND status = \'draft\'', [eventId]);
      for (const session of sessionsInput) {
        const sessionId = randomUUID();
        await client.query(
          `INSERT INTO event_sessions (id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime", status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, 'draft', now(), now())`,
          [
            sessionId,
            eventId,
            new Date(session.startTime),
            new Date(session.endTime),
            session.admissionStartTime ? new Date(session.admissionStartTime) : null,
            session.admissionEndTime ? new Date(session.admissionEndTime) : null,
          ],
        );

        for (const tt of session.ticketTypes) {
          const ttId = randomUUID();
          await client.query(
            `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
            [ttId, sessionId, tt.name.trim(), tt.price, tt.quota, tt.description || ''],
          );
        }
      }
    }

    return getEventDetails(client, eventId, organizerId);
  });
}

export async function submitSessionForApproval(
  pool: Pool,
  sessionId: string,
  organizerId: string,
) {
  await ensureEventSchema(pool);
  return inTransaction(pool, async client => {
    const res = await client.query(
      `SELECT s.id, e."organizerId" 
       FROM event_sessions s
       JOIN events e ON e.id = s."eventId"
       WHERE s.id = $1`,
      [sessionId],
    );
    if (res.rowCount === 0) throw new Error('ไม่พบข้อมูลรอบการแสดง');
    if (res.rows[0].organizerId !== organizerId) {
      throw new Error('ไม่อนุญาต: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้');
    }

    await client.query(
      `UPDATE event_sessions SET status = 'pending_approval', "updatedAt" = now() WHERE id = $1`,
      [sessionId],
    );
    return { success: true };
  });
}

export async function approveSession(
  pool: Pool,
  sessionId: string,
  ownerId: string,
) {
  await ensureEventSchema(pool);
  return inTransaction(pool, async client => {
    // Check owner role
    const userRes = await client.query('SELECT role FROM auth_user WHERE id = $1', [ownerId]);
    if (userRes.rowCount === 0 || userRes.rows[0].role !== 'owner') {
      throw new Error('ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้นที่สามารถอนุมัติรอบการแสดงได้');
    }

    const sessRes = await client.query(
      `SELECT s.id, s."eventId", s.status, e.title 
       FROM event_sessions s
       JOIN events e ON e.id = s."eventId"
       WHERE s.id = $1`,
      [sessionId],
    );
    if (sessRes.rowCount === 0) throw new Error('ไม่พบข้อมูลรอบการแสดง');

    // Update session status to approved
    await client.query(
      `UPDATE event_sessions SET status = 'approved', "updatedAt" = now() WHERE id = $1`,
      [sessionId],
    );

    // If event is draft or pending, mark event as approved too
    await client.query(
      `UPDATE events SET status = 'approved', "updatedAt" = now() WHERE id = $1`,
      [sessRes.rows[0].eventId],
    );

    return { success: true, sessionId, eventId: sessRes.rows[0].eventId };
  });
}

export async function listPendingSessionsForOwner(pool: Pool) {
  await ensureEventSchema(pool);
  const res = await pool.query(
    `SELECT s.id AS "sessionId", s."startTime", s."endTime", s.status AS "sessionStatus",
            e.id AS "eventId", e.title AS "eventTitle", e.location, e."posterUrl",
            u.name AS "organizerName", u.email AS "organizerEmail",
            (SELECT COUNT(*) FROM ticket_types tt WHERE tt."sessionId" = s.id) AS "ticketTypeCount"
     FROM event_sessions s
     JOIN events e ON e.id = s."eventId"
     JOIN auth_user u ON u.id = e."organizerId"
     WHERE s.status = 'pending_approval'
     ORDER BY s."createdAt" ASC`,
  );
  return res.rows;
}

export async function listOrganizerEvents(pool: Pool, organizerId: string) {
  await ensureEventSchema(pool);
  const res = await pool.query(
    `SELECT e.*, 
            COUNT(s.id) AS "sessionCount"
     FROM events e
     LEFT JOIN event_sessions s ON s."eventId" = e.id
     WHERE e."organizerId" = $1
     GROUP BY e.id
     ORDER BY e."createdAt" DESC`,
    [organizerId],
  );
  return res.rows;
}

export async function getEventDetails(clientOrPool: { query: Pool['query'] }, eventId: string, organizerId?: string) {
  const evRes = await clientOrPool.query('SELECT * FROM events WHERE id = $1', [eventId]);
  if (evRes.rowCount === 0) return null;
  const event = evRes.rows[0];

  if (organizerId && event.organizerId !== organizerId) {
    throw new Error('ไม่อนุญาต: ไม่มีสิทธิ์เข้าถึงงานคอนเสิร์ตนี้');
  }

  const sessRes = await clientOrPool.query(
    'SELECT * FROM event_sessions WHERE "eventId" = $1 ORDER BY "startTime" ASC',
    [eventId],
  );
  const sessions = [];

  for (const sess of sessRes.rows) {
    const ttRes = await clientOrPool.query(
      'SELECT * FROM ticket_types WHERE "sessionId" = $1 ORDER BY price ASC',
      [sess.id],
    );
    sessions.push({ ...sess, ticketTypes: ttRes.rows });
  }

  return { ...event, sessions };
}

// Public catalog access: only approved events with approved sessions are public
export async function getPublicEventWithApprovedSessions(pool: Pool, eventId: string) {
  await ensureEventSchema(pool);
  const evRes = await pool.query(
    `SELECT id, title, description, location, "posterUrl", "limitPerOrder", status 
     FROM events 
     WHERE id = $1 AND status = 'approved'`,
    [eventId],
  );
  if (evRes.rowCount === 0) return null;
  const event = evRes.rows[0];

  const sessRes = await pool.query(
    `SELECT id, "startTime", "endTime", "admissionStartTime", "admissionEndTime", status
     FROM event_sessions
     WHERE "eventId" = $1 AND status = 'approved'
     ORDER BY "startTime" ASC`,
    [eventId],
  );

  const sessions = [];
  for (const sess of sessRes.rows) {
    const ttRes = await pool.query(
      'SELECT id, name, price, quota, description FROM ticket_types WHERE "sessionId" = $1 ORDER BY price ASC',
      [sess.id],
    );
    sessions.push({ ...sess, ticketTypes: ttRes.rows });
  }

  return { ...event, sessions };
}
