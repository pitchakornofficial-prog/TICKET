import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { inTransaction } from './database.ts';
import { ensureFeeSchema } from './fees.ts';
import { ensureReservationSchema } from './reservation.ts';
import { ensureRefundSchema, processSessionCancellationRefunds } from './refunds.ts';

export type EventStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled';
export type SessionStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled';

export interface EventDraftInput {
  title: string;
  description?: string;
  location: string;
  posterUrl?: string;
  ticketTemplateUrl?: string;
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

export interface PublicEventSummary {
  id: string;
  title: string;
  description: string;
  location: string;
  posterUrl: string | null;
  limitPerOrder: number;
  status: string;
  earliestStartTime: string;
  latestEndTime: string;
  startingPrice: number;
  approvedSessionCount: number;
  totalQuota: number;
}

const eventSchemaInitialized = new WeakSet<Pool>();

export async function ensureEventSchema(pool: Pool): Promise<void> {
  if (eventSchemaInitialized.has(pool)) {
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      "organizerId" TEXT NOT NULL REFERENCES auth_user(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL,
      "posterUrl" TEXT,
      "ticketTemplateUrl" TEXT,
      "limitPerOrder" INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'draft',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE events ADD COLUMN IF NOT EXISTS "ticketTemplateUrl" TEXT;
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

    CREATE TABLE IF NOT EXISTS event_scanners (
      id TEXT PRIMARY KEY,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "scannerId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE("eventId", "scannerId")
    );
    CREATE INDEX IF NOT EXISTS idx_event_scanners_scannerId ON event_scanners("scannerId");
    CREATE INDEX IF NOT EXISTS idx_event_scanners_eventId ON event_scanners("eventId");

    CREATE TABLE IF NOT EXISTS event_primary_scanners (
      "eventId" TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      "scannerId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      "scannerName" TEXT NOT NULL,
      "scannerEmail" TEXT NOT NULL,
      "deviceId" TEXT,
      "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "assignedBy" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_event_primary_scanner ON event_primary_scanners("scannerId");

    CREATE TABLE IF NOT EXISTS session_amendments (
      id TEXT PRIMARY KEY,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "organizerId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      "startTime" TIMESTAMPTZ,
      "endTime" TIMESTAMPTZ,
      "admissionStartTime" TIMESTAMPTZ,
      "admissionEndTime" TIMESTAMPTZ,
      "ticketTypes" JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      "rejectionReason" TEXT,
      "reviewedBy" TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
      "reviewedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_session_amendments_sessionId ON session_amendments("sessionId");
    CREATE INDEX IF NOT EXISTS idx_session_amendments_status ON session_amendments(status);

    CREATE TABLE IF NOT EXISTS session_cancellations (
      id TEXT PRIMARY KEY,
      "sessionId" TEXT NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
      "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      "organizerId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      "rejectionReason" TEXT,
      "reviewedBy" TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
      "reviewedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_session_cancellations_session ON session_cancellations("sessionId");
    CREATE INDEX IF NOT EXISTS idx_session_cancellations_status ON session_cancellations(status);

    ALTER TABLE event_sessions ADD COLUMN IF NOT EXISTS "specialRefundWindowStart" TIMESTAMPTZ;
    ALTER TABLE event_sessions ADD COLUMN IF NOT EXISTS "specialRefundWindowEnd" TIMESTAMPTZ;
    ALTER TABLE event_sessions ADD COLUMN IF NOT EXISTS "rescheduledFromStartTime" TIMESTAMPTZ;
    ALTER TABLE event_sessions ADD COLUMN IF NOT EXISTS "rescheduledFromEndTime" TIMESTAMPTZ;
    ALTER TABLE session_amendments ADD COLUMN IF NOT EXISTS "specialRefundWindowStart" TIMESTAMPTZ;
    ALTER TABLE session_amendments ADD COLUMN IF NOT EXISTS "specialRefundWindowEnd" TIMESTAMPTZ;
  `);
  await ensureFeeSchema(pool);
  eventSchemaInitialized.add(pool);
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
      `INSERT INTO events (id, "organizerId", title, description, location, "posterUrl", "ticketTemplateUrl", "limitPerOrder", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', now(), now())`,
      [
        eventId,
        organizerId,
        eventInput.title.trim(),
        eventInput.description?.trim() || '',
        eventInput.location.trim(),
        eventInput.posterUrl || null,
        eventInput.ticketTemplateUrl || null,
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
    if (eventInput.ticketTemplateUrl !== undefined) {
      await client.query('UPDATE events SET "ticketTemplateUrl" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.ticketTemplateUrl, eventId]);
    }
    if (eventInput.limitPerOrder !== undefined) {
      await client.query('UPDATE events SET "limitPerOrder" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.limitPerOrder, eventId]);
    }

    if (sessionsInput) {
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

    await client.query(
      `UPDATE event_sessions SET status = 'approved', "updatedAt" = now() WHERE id = $1`,
      [sessionId],
    );

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
export async function listPublicEvents(pool: Pool, search?: string): Promise<PublicEventSummary[]> {
  try {
    await ensureEventSchema(pool);
    const query = `
      SELECT 
        e.id, 
        e.title, 
        e.description, 
        e.location, 
        e."posterUrl", 
        e."limitPerOrder",
        e.status,
        MIN(s."startTime") AS "earliestStartTime",
        MAX(s."endTime") AS "latestEndTime",
        COALESCE(MIN(tt.price), 0) AS "startingPrice",
        COUNT(DISTINCT s.id)::int AS "approvedSessionCount",
        COALESCE(SUM(tt.quota), 0)::int AS "totalQuota"
      FROM events e
      JOIN event_sessions s ON s."eventId" = e.id AND s.status = 'approved'
      LEFT JOIN ticket_types tt ON tt."sessionId" = s.id
      WHERE e.status = 'approved'
        AND ($1::text IS NULL OR e.title ILIKE '%' || $1 || '%' OR e.location ILIKE '%' || $1 || '%')
      GROUP BY e.id, e.title, e.description, e.location, e."posterUrl", e."limitPerOrder", e.status
      ORDER BY MIN(s."startTime") ASC
    `;
    const res = await pool.query(query, [search?.trim() ? search.trim() : null]);
    return res.rows.map(r => ({
      ...r,
      startingPrice: Number(r.startingPrice),
      approvedSessionCount: Number(r.approvedSessionCount),
      totalQuota: Number(r.totalQuota),
      earliestStartTime: r.earliestStartTime instanceof Date ? r.earliestStartTime.toISOString() : String(r.earliestStartTime),
      latestEndTime: r.latestEndTime instanceof Date ? r.latestEndTime.toISOString() : String(r.latestEndTime),
    }));
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'ECONNREFUSED') {
      console.warn('[TICKET] ฐานข้อมูล PostgreSQL ยังไม่พร้อมทำงานที่ 127.0.0.1:55432 (รัน "npm run db:up" เพื่อเปิดใช้งาน)');
    } else {
      console.error('Failed to list public events:', error);
    }
    return [];
  }
}

export async function getPublicEventWithApprovedSessions(pool: Pool, eventId: string) {
  try {
    await ensureEventSchema(pool);
    const evRes = await pool.query(
      `SELECT e.id, e.title, e.description, e.location, e."posterUrl", e."ticketTemplateUrl", e."limitPerOrder", e.status,
              u.name as "organizerName", u.email as "organizerEmail"
       FROM events e
       LEFT JOIN auth_user u ON e."organizerId" = u.id
       WHERE e.id = $1 AND e.status = 'approved'`,
      [eventId],
    );
    if (evRes.rowCount === 0) return null;
    const event = evRes.rows[0];

    const sessRes = await pool.query(
      `SELECT id, "startTime", "endTime", "admissionStartTime", "admissionEndTime",
              "specialRefundWindowStart", "specialRefundWindowEnd",
              "rescheduledFromStartTime", "rescheduledFromEndTime", status
       FROM event_sessions
       WHERE "eventId" = $1 AND status = 'approved'
       ORDER BY "startTime" ASC`,
      [eventId],
    );

    const hasOrderTablesRes = await pool.query(
      "SELECT to_regclass('public.orders') as orders, to_regclass('public.order_items') as items",
    );
    const canCheckHeld = Boolean(hasOrderTablesRes.rows[0]?.orders && hasOrderTablesRes.rows[0]?.items);

    const sessions = [];
    for (const sess of sessRes.rows) {
      const query = canCheckHeld
        ? `SELECT tt.id, tt.name, tt.price, tt.description,
                  GREATEST(0, tt.quota - GREATEST(0, COALESCE(
                    (SELECT SUM(oi.quantity)::int
                     FROM order_items oi
                     JOIN orders o ON oi."orderId" = o.id
                     WHERE oi."ticketTypeId" = tt.id
                       AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > now()))
                    ), 0
                  ) - COALESCE(
                    (SELECT COUNT(*)::int
                     FROM tickets t
                     WHERE t."ticketTypeId" = tt.id AND t.status = 'refunded'
                    ), 0
                  ))) AS quota
           FROM ticket_types tt
           WHERE tt."sessionId" = $1
           ORDER BY tt.price ASC`
        : 'SELECT id, name, price, quota, description FROM ticket_types WHERE "sessionId" = $1 ORDER BY price ASC';

      const ttRes = await pool.query(query, [sess.id]);
      sessions.push({
        ...sess,
        ticketTypes: ttRes.rows.map(tt => ({
          ...tt,
          price: Number(tt.price),
          quota: Number(tt.quota),
        })),
      });
    }

    return { ...event, sessions };
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'ECONNREFUSED') {
      console.warn('[TICKET] ฐานข้อมูล PostgreSQL ยังไม่พร้อมทำงานที่ 127.0.0.1:55432 (รัน "npm run db:up" เพื่อเปิดใช้งาน)');
    } else {
      console.error('Failed to get public event details:', error);
    }
    return null;
  }
}

export const getPublicEventDetails = getPublicEventWithApprovedSessions;

export interface EventScannerItem {
  id: string;
  scannerId: string;
  name: string;
  email: string;
  assignedAt: string;
  isPrimary?: boolean;
}

export interface ScannerAssignedEvent {
  id: string;
  title: string;
  location: string;
  posterUrl: string | null;
  status: string;
  assignedAt: string;
  isPrimary?: boolean;
  primaryScannerId?: string | null;
  primaryScannerName?: string | null;
  sessions: {
    id: string;
    startTime: string;
    endTime: string;
    admissionStartTime?: string | null;
    admissionEndTime?: string | null;
    status: string;
  }[];
}

export async function addScannerToEvent(
  pool: Pool,
  organizerId: string,
  eventId: string,
  data: { name: string; email: string; password?: string; scannerId?: string },
): Promise<{ id: string; scannerId: string; name: string; email: string }> {
  await ensureEventSchema(pool);

  const evRes = await pool.query<{ organizerId: string }>('SELECT "organizerId" FROM events WHERE id = $1', [eventId]);
  if (evRes.rowCount === 0) throw new Error('ไม่พบงานคอนเสิร์ต');
  if (evRes.rows[0].organizerId !== organizerId) {
    throw new Error('คุณไม่มีสิทธิ์จัดการทีมสแกนของงานนี้');
  }

  return inTransaction(pool, async client => {
    let targetScannerId = data.scannerId;
    let targetName = data.name.trim();
    const targetEmail = data.email.trim().toLowerCase();

    if (!targetScannerId) {
      if (!targetEmail) throw new Error('กรุณาระบุอีเมลสำหรับบัญชีทีมสแกน');
      if (!targetName) targetName = 'ทีมสแกนบัตร';

      const userRes = await client.query<{ id: string; role: string; name: string }>(
        'SELECT id, role, name FROM auth_user WHERE email = $1',
        [targetEmail],
      );

      if (userRes.rowCount && userRes.rowCount > 0) {
        const existing = userRes.rows[0];
        if (existing.role !== 'scanner') {
          throw new Error('อีเมลนี้เป็นของผู้ใช้บทบาทอื่น ไม่สามารถเพิ่มเป็นทีมสแกนได้');
        }
        targetScannerId = existing.id;
        targetName = existing.name;
      } else {
        targetScannerId = randomUUID();
        const pwd = data.password || 'Scanner-Default-Password!2026';
        if (pwd.length < 15) throw new Error('รหัสผ่านต้องมีความยาวอย่างน้อย 15 ตัวอักษร');
        const hashedPassword = await hashPassword(pwd);

        await client.query(
          'INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, true, $4, now(), now())',
          [targetScannerId, targetName, targetEmail, 'scanner'],
        );
        await client.query(
          'INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $2, $4, now(), now())',
          [randomUUID(), targetScannerId, 'credential', hashedPassword],
        );
      }
    }

    const assignmentId = randomUUID();
    const assignRes = await client.query<{ id: string }>(
      `INSERT INTO event_scanners (id, "eventId", "scannerId", "assignedAt")
       VALUES ($1, $2, $3, now())
       ON CONFLICT ("eventId", "scannerId") DO UPDATE SET "assignedAt" = now()
       RETURNING id`,
      [assignmentId, eventId, targetScannerId],
    );

    return {
      id: assignRes.rows[0].id,
      scannerId: targetScannerId,
      name: targetName,
      email: targetEmail,
    };
  });
}

export async function listScannersForEvent(
  pool: Pool,
  organizerId: string,
  eventId: string,
): Promise<EventScannerItem[]> {
  await ensureEventSchema(pool);

  const evRes = await pool.query<{ organizerId: string }>('SELECT "organizerId" FROM events WHERE id = $1', [eventId]);
  if (evRes.rowCount === 0) throw new Error('ไม่พบงานคอนเสิร์ต');
  if (evRes.rows[0].organizerId !== organizerId) {
    throw new Error('คุณไม่มีสิทธิ์เข้าถึงทีมสแกนของงานนี้');
  }

  const result = await pool.query<{
    id: string;
    scannerId: string;
    name: string;
    email: string;
    assignedAt: Date;
    isPrimary: boolean | null;
  }>(
    `SELECT es.id, es."scannerId", u.name, u.email, es."assignedAt",
            (ps."scannerId" IS NOT NULL) as "isPrimary"
     FROM event_scanners es
     JOIN auth_user u ON u.id = es."scannerId"
     LEFT JOIN event_primary_scanners ps ON ps."eventId" = es."eventId" AND ps."scannerId" = es."scannerId"
     WHERE es."eventId" = $1
     ORDER BY es."assignedAt" DESC`,
    [eventId],
  );

  return result.rows.map(r => ({
    id: r.id,
    scannerId: r.scannerId,
    name: r.name,
    email: r.email,
    assignedAt: r.assignedAt instanceof Date ? r.assignedAt.toISOString() : String(r.assignedAt),
    isPrimary: Boolean(r.isPrimary),
  }));
}

export async function removeScannerFromEvent(
  pool: Pool,
  organizerId: string,
  eventId: string,
  scannerId: string,
): Promise<boolean> {
  await ensureEventSchema(pool);

  const evRes = await pool.query<{ organizerId: string }>('SELECT "organizerId" FROM events WHERE id = $1', [eventId]);
  if (evRes.rowCount === 0) throw new Error('ไม่พบงานคอนเสิร์ต');
  if (evRes.rows[0].organizerId !== organizerId) {
    throw new Error('คุณไม่มีสิทธิ์จัดการทีมสแกนของงานนี้');
  }

  const result = await pool.query(
    'DELETE FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2',
    [eventId, scannerId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function listEventsForScanner(
  pool: Pool,
  scannerId: string,
): Promise<ScannerAssignedEvent[]> {
  await ensureEventSchema(pool);

  const evRes = await pool.query<{
    id: string;
    title: string;
    location: string;
    posterUrl: string | null;
    status: string;
    assignedAt: Date;
    primaryScannerId: string | null;
    primaryScannerName: string | null;
  }>(
    `SELECT e.id, e.title, e.location, e."posterUrl", e.status, es."assignedAt",
            ps."scannerId" as "primaryScannerId", ps."scannerName" as "primaryScannerName"
     FROM events e
     JOIN event_scanners es ON es."eventId" = e.id
     LEFT JOIN event_primary_scanners ps ON ps."eventId" = e.id
     WHERE es."scannerId" = $1
     ORDER BY es."assignedAt" DESC`,
    [scannerId],
  );

  const events: ScannerAssignedEvent[] = [];
  for (const ev of evRes.rows) {
    const sessRes = await pool.query<{
      id: string;
      startTime: Date;
      endTime: Date;
      admissionStartTime: Date | null;
      admissionEndTime: Date | null;
      status: string;
    }>(
      `SELECT id, "startTime", "endTime", "admissionStartTime", "admissionEndTime", status
       FROM event_sessions
       WHERE "eventId" = $1
       ORDER BY "startTime" ASC`,
      [ev.id],
    );

    events.push({
      id: ev.id,
      title: ev.title,
      location: ev.location,
      posterUrl: ev.posterUrl,
      status: ev.status,
      assignedAt: ev.assignedAt instanceof Date ? ev.assignedAt.toISOString() : String(ev.assignedAt),
      isPrimary: ev.primaryScannerId === scannerId,
      primaryScannerId: ev.primaryScannerId,
      primaryScannerName: ev.primaryScannerName,
      sessions: sessRes.rows.map(s => ({
        id: s.id,
        startTime: s.startTime instanceof Date ? s.startTime.toISOString() : String(s.startTime),
        endTime: s.endTime instanceof Date ? s.endTime.toISOString() : String(s.endTime),
        admissionStartTime: s.admissionStartTime
          ? s.admissionStartTime instanceof Date
            ? s.admissionStartTime.toISOString()
            : String(s.admissionStartTime)
          : null,
        admissionEndTime: s.admissionEndTime
          ? s.admissionEndTime instanceof Date
            ? s.admissionEndTime.toISOString()
            : String(s.admissionEndTime)
          : null,
        status: s.status,
      })),
    });
  }

  return events;
}

export interface AmendmentTicketTypeItem {
  id?: string;
  name: string;
  price: number;
  quota: number;
  description?: string;
}

export interface SubmitSessionAmendmentInput {
  sessionId: string;
  organizerId: string;
  startTime?: string | Date;
  endTime?: string | Date;
  admissionStartTime?: string | Date | null;
  admissionEndTime?: string | Date | null;
  ticketTypes: AmendmentTicketTypeItem[];
}

export interface SessionAmendmentRecord {
  id: string;
  sessionId: string;
  eventId: string;
  eventTitle: string;
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  startTime: string | null;
  endTime: string | null;
  admissionStartTime: string | null;
  admissionEndTime: string | null;
  currentStartTime: string;
  currentEndTime: string;
  currentAdmissionStartTime: string | null;
  currentAdmissionEndTime: string | null;
  ticketTypes: AmendmentTicketTypeItem[];
  currentTicketTypes: {
    id: string;
    name: string;
    price: number;
    quota: number;
    heldQuota: number;
  }[];
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Submit amendment for an approved/live session (AC-67, AC-109, G-12).
 */
export async function submitSessionAmendment(
  pool: Pool,
  input: SubmitSessionAmendmentInput,
): Promise<{ success: boolean; amendmentId: string }> {
  await ensureEventSchema(pool);
  await ensureReservationSchema(pool);

  return inTransaction(pool, async client => {
    // 1. Verify session exists and organizer owns the event
    const sessRes = await client.query<{
      id: string;
      eventId: string;
      organizerId: string;
      status: string;
    }>(
      `SELECT s.id, s."eventId", s.status, e."organizerId"
       FROM event_sessions s
       JOIN events e ON e.id = s."eventId"
       WHERE s.id = $1`,
      [input.sessionId],
    );

    if (sessRes.rowCount === 0) {
      throw new Error('ไม่พบข้อมูลรอบการแสดงที่ต้องการแก้ไข');
    }

    const session = sessRes.rows[0];
    if (session.organizerId !== input.organizerId) {
      throw new Error('ไม่อนุญาต: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้');
    }

    if (session.status !== 'approved') {
      throw new Error('แก้ไขได้เฉพาะรอบการแสดงที่ได้รับการอนุมัติแล้วเท่านั้น (Approved live session)');
    }

    // 2. Initial quota validation (AC-109)
    for (const item of input.ticketTypes) {
      if (item.quota <= 0) {
        throw new Error(`จำนวนบัตรสำหรับประเภท "${item.name}" ต้องมากกว่า 0`);
      }
      if (item.price < 0) {
        throw new Error(`ราคาบัตรสำหรับประเภท "${item.name}" ต้องไม่ติดลบ`);
      }

      if (item.id) {
        const heldRes = await client.query<{ heldQuota: number }>(
          `SELECT GREATEST(0, COALESCE(
            (SELECT SUM(oi.quantity)::int
             FROM order_items oi
             JOIN orders o ON oi."orderId" = o.id
             WHERE oi."ticketTypeId" = $1
               AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > now()))
            ), 0
          ) - COALESCE(
            (SELECT COUNT(*)::int
             FROM tickets t
             WHERE t."ticketTypeId" = $1 AND t.status = 'refunded'
            ), 0
          )) AS "heldQuota"`,
          [item.id],
        );

        const currentHeld = heldRes.rows[0]?.heldQuota ? Number(heldRes.rows[0].heldQuota) : 0;
        if (item.quota < currentHeld) {
          throw new Error(
            `โควตาใหม่ (${item.quota}) สำหรับประเภทบัตร "${item.name}" น้อยกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้ว (${currentHeld} ใบ) ไม่สามารถลดโควตาต่ำกว่านี้ได้ (AC-109)`,
          );
        }
      }
    }

    const amendmentId = randomUUID();
    await client.query(
      `INSERT INTO session_amendments (
        id, "sessionId", "eventId", "organizerId",
        "startTime", "endTime", "admissionStartTime", "admissionEndTime",
        "ticketTypes", status, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', now(), now())`,
      [
        amendmentId,
        session.id,
        session.eventId,
        input.organizerId,
        input.startTime ? new Date(input.startTime) : null,
        input.endTime ? new Date(input.endTime) : null,
        input.admissionStartTime ? new Date(input.admissionStartTime) : null,
        input.admissionEndTime ? new Date(input.admissionEndTime) : null,
        JSON.stringify(input.ticketTypes),
      ],
    );

    return { success: true, amendmentId };
  });
}

/**
 * List pending session amendments for Owner dashboard.
 */
export async function listPendingSessionAmendments(pool: Pool): Promise<SessionAmendmentRecord[]> {
  await ensureEventSchema(pool);
  await ensureReservationSchema(pool);

  const res = await pool.query<{
    id: string;
    sessionId: string;
    eventId: string;
    eventTitle: string;
    organizerId: string;
    organizerName: string;
    organizerEmail: string;
    startTime: Date | null;
    endTime: Date | null;
    admissionStartTime: Date | null;
    admissionEndTime: Date | null;
    currentStartTime: Date;
    currentEndTime: Date;
    currentAdmissionStartTime: Date | null;
    currentAdmissionEndTime: Date | null;
    ticketTypes: AmendmentTicketTypeItem[];
    status: 'pending' | 'approved' | 'rejected';
    rejectionReason: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT sa.id, sa."sessionId", sa."eventId", e.title AS "eventTitle",
            sa."organizerId", u.name AS "organizerName", u.email AS "organizerEmail",
            sa."startTime", sa."endTime", sa."admissionStartTime", sa."admissionEndTime",
            s."startTime" AS "currentStartTime", s."endTime" AS "currentEndTime",
            s."admissionStartTime" AS "currentAdmissionStartTime", s."admissionEndTime" AS "currentAdmissionEndTime",
            sa."ticketTypes", sa.status, sa."rejectionReason", sa."reviewedBy", sa."reviewedAt",
            sa."createdAt", sa."updatedAt"
     FROM session_amendments sa
     JOIN event_sessions s ON s.id = sa."sessionId"
     JOIN events e ON e.id = sa."eventId"
     JOIN auth_user u ON u.id = sa."organizerId"
     WHERE sa.status = 'pending'
     ORDER BY sa."createdAt" ASC`,
  );

  const results: SessionAmendmentRecord[] = [];
  for (const row of res.rows) {
    const curTtRes = await pool.query<{
      id: string;
      name: string;
      price: number;
      quota: number;
    }>(
      `SELECT id, name, price, quota FROM ticket_types WHERE "sessionId" = $1 ORDER BY name ASC`,
      [row.sessionId],
    );

    const currentTicketTypes = [];
    for (const tt of curTtRes.rows) {
      const heldRes = await pool.query<{ heldQuota: number }>(
        `SELECT GREATEST(0, COALESCE(
          (SELECT SUM(oi.quantity)::int
           FROM order_items oi
           JOIN orders o ON oi."orderId" = o.id
           WHERE oi."ticketTypeId" = $1
             AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > now()))
          ), 0
        ) - COALESCE(
          (SELECT COUNT(*)::int
           FROM tickets t
           WHERE t."ticketTypeId" = $1 AND t.status = 'refunded'
          ), 0
        )) AS "heldQuota"`,
        [tt.id],
      );
      currentTicketTypes.push({
        id: tt.id,
        name: tt.name,
        price: Number(tt.price),
        quota: Number(tt.quota),
        heldQuota: heldRes.rows[0]?.heldQuota ? Number(heldRes.rows[0].heldQuota) : 0,
      });
    }

    const ticketTypes: AmendmentTicketTypeItem[] = typeof row.ticketTypes === 'string'
      ? JSON.parse(row.ticketTypes)
      : row.ticketTypes;

    results.push({
      id: row.id,
      sessionId: row.sessionId,
      eventId: row.eventId,
      eventTitle: row.eventTitle,
      organizerId: row.organizerId,
      organizerName: row.organizerName,
      organizerEmail: row.organizerEmail,
      startTime: row.startTime ? row.startTime.toISOString() : null,
      endTime: row.endTime ? row.endTime.toISOString() : null,
      admissionStartTime: row.admissionStartTime ? row.admissionStartTime.toISOString() : null,
      admissionEndTime: row.admissionEndTime ? row.admissionEndTime.toISOString() : null,
      currentStartTime: row.currentStartTime.toISOString(),
      currentEndTime: row.currentEndTime.toISOString(),
      currentAdmissionStartTime: row.currentAdmissionStartTime ? row.currentAdmissionStartTime.toISOString() : null,
      currentAdmissionEndTime: row.currentAdmissionEndTime ? row.currentAdmissionEndTime.toISOString() : null,
      ticketTypes,
      currentTicketTypes,
      status: row.status,
      rejectionReason: row.rejectionReason,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  return results;
}

/**
 * List all amendments for a session (for Organizer tracking).
 */
export async function listSessionAmendments(
  pool: Pool,
  sessionId: string,
): Promise<SessionAmendmentRecord[]> {
  await ensureEventSchema(pool);
  await ensureReservationSchema(pool);

  const res = await pool.query<{
    id: string;
    sessionId: string;
    eventId: string;
    eventTitle: string;
    organizerId: string;
    organizerName: string;
    organizerEmail: string;
    startTime: Date | null;
    endTime: Date | null;
    admissionStartTime: Date | null;
    admissionEndTime: Date | null;
    currentStartTime: Date;
    currentEndTime: Date;
    currentAdmissionStartTime: Date | null;
    currentAdmissionEndTime: Date | null;
    ticketTypes: AmendmentTicketTypeItem[];
    status: 'pending' | 'approved' | 'rejected';
    rejectionReason: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT sa.id, sa."sessionId", sa."eventId", e.title AS "eventTitle",
            sa."organizerId", u.name AS "organizerName", u.email AS "organizerEmail",
            sa."startTime", sa."endTime", sa."admissionStartTime", sa."admissionEndTime",
            s."startTime" AS "currentStartTime", s."endTime" AS "currentEndTime",
            s."admissionStartTime" AS "currentAdmissionStartTime", s."admissionEndTime" AS "currentAdmissionEndTime",
            sa."ticketTypes", sa.status, sa."rejectionReason", sa."reviewedBy", sa."reviewedAt",
            sa."createdAt", sa."updatedAt"
     FROM session_amendments sa
     JOIN event_sessions s ON s.id = sa."sessionId"
     JOIN events e ON e.id = sa."eventId"
     JOIN auth_user u ON u.id = sa."organizerId"
     WHERE sa."sessionId" = $1
     ORDER BY sa."createdAt" DESC`,
    [sessionId],
  );

  return res.rows.map(row => ({
    id: row.id,
    sessionId: row.sessionId,
    eventId: row.eventId,
    eventTitle: row.eventTitle,
    organizerId: row.organizerId,
    organizerName: row.organizerName,
    organizerEmail: row.organizerEmail,
    startTime: row.startTime ? row.startTime.toISOString() : null,
    endTime: row.endTime ? row.endTime.toISOString() : null,
    admissionStartTime: row.admissionStartTime ? row.admissionStartTime.toISOString() : null,
    admissionEndTime: row.admissionEndTime ? row.admissionEndTime.toISOString() : null,
    currentStartTime: row.currentStartTime.toISOString(),
    currentEndTime: row.currentEndTime.toISOString(),
    currentAdmissionStartTime: row.currentAdmissionStartTime ? row.currentAdmissionStartTime.toISOString() : null,
    currentAdmissionEndTime: row.currentAdmissionEndTime ? row.currentAdmissionEndTime.toISOString() : null,
    ticketTypes: typeof row.ticketTypes === 'string' ? JSON.parse(row.ticketTypes) : row.ticketTypes,
    currentTicketTypes: [],
    status: row.status,
    rejectionReason: row.rejectionReason,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export interface ApproveSessionAmendmentInput {
  amendmentId: string;
  ownerId: string;
  specialRefundWindowStart?: string | Date | null;
  specialRefundWindowEnd?: string | Date | null;
}

/**
 * Approve session amendment with atomic quota and reservation protection (AC-67, AC-68, AC-109, AC-38).
 */
export async function approveSessionAmendment(
  pool: Pool,
  input: ApproveSessionAmendmentInput,
): Promise<{ success: boolean; message: string }> {
  await ensureEventSchema(pool);
  await ensureReservationSchema(pool);

  return inTransaction(pool, async client => {
    // 1. Check owner role
    const userRes = await client.query('SELECT role FROM auth_user WHERE id = $1', [input.ownerId]);
    if (userRes.rowCount === 0 || userRes.rows[0].role !== 'owner') {
      throw new Error('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่สามารถอนุมัติการแก้ไขรอบได้');
    }

    // 2. Lock amendment FOR UPDATE
    const amdRes = await client.query<{
      id: string;
      sessionId: string;
      eventId: string;
      startTime: Date | null;
      endTime: Date | null;
      admissionStartTime: Date | null;
      admissionEndTime: Date | null;
      ticketTypes: AmendmentTicketTypeItem[];
      status: string;
    }>(
      `SELECT id, "sessionId", "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime", "ticketTypes", status
       FROM session_amendments
       WHERE id = $1
       FOR UPDATE`,
      [input.amendmentId],
    );

    if (amdRes.rowCount === 0) {
      throw new Error('ไม่พบคำขอแก้ไขรอบการแสดงที่ระบุ');
    }

    const amd = amdRes.rows[0];
    if (amd.status !== 'pending') {
      return { success: true, message: 'คำขอแก้ไขนี้ได้รับการดำเนินการไปแล้ว' };
    }

    const ticketTypes: AmendmentTicketTypeItem[] = typeof amd.ticketTypes === 'string'
      ? JSON.parse(amd.ticketTypes)
      : amd.ticketTypes;

    // 3. Atomic quota check with locks (AC-109)
    for (const item of ticketTypes) {
      if (item.id) {
        // Lock ticket_type row
        await client.query('SELECT id, quota FROM ticket_types WHERE id = $1 FOR UPDATE', [item.id]);

        const heldRes = await client.query<{ heldQuota: number }>(
          `SELECT GREATEST(0, COALESCE(
            (SELECT SUM(oi.quantity)::int
             FROM order_items oi
             JOIN orders o ON oi."orderId" = o.id
             WHERE oi."ticketTypeId" = $1
               AND (o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > now()))
            ), 0
          ) - COALESCE(
            (SELECT COUNT(*)::int
             FROM tickets t
             WHERE t."ticketTypeId" = $1 AND t.status = 'refunded'
            ), 0
          )) AS "heldQuota"`,
          [item.id],
        );

        const currentHeld = heldRes.rows[0]?.heldQuota ? Number(heldRes.rows[0].heldQuota) : 0;
        if (item.quota < currentHeld) {
          throw new Error(
            `โควตาใหม่ (${item.quota}) สำหรับประเภทบัตร "${item.name}" น้อยกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้ว (${currentHeld} ใบ) ไม่สามารถลดโควตาได้ (AC-109)`,
          );
        }
      }
    }

    // 4. Update session times if provided (AC-67, AC-108)
    if (amd.startTime) {
      await client.query(
        `UPDATE event_sessions
         SET "rescheduledFromStartTime" = COALESCE("rescheduledFromStartTime", "startTime"),
             "rescheduledFromEndTime" = COALESCE("rescheduledFromEndTime", "endTime"),
             "startTime" = $2,
             "updatedAt" = now()
         WHERE id = $1`,
        [amd.sessionId, amd.startTime],
      );
    }
    if (amd.endTime) {
      await client.query(
        `UPDATE event_sessions SET "endTime" = $2, "updatedAt" = now() WHERE id = $1`,
        [amd.sessionId, amd.endTime],
      );
    }
    if (amd.admissionStartTime !== null && amd.admissionStartTime !== undefined) {
      await client.query(
        `UPDATE event_sessions SET "admissionStartTime" = $2, "updatedAt" = now() WHERE id = $1`,
        [amd.sessionId, amd.admissionStartTime],
      );
    }
    if (amd.admissionEndTime !== null && amd.admissionEndTime !== undefined) {
      await client.query(
        `UPDATE event_sessions SET "admissionEndTime" = $2, "updatedAt" = now() WHERE id = $1`,
        [amd.sessionId, amd.admissionEndTime],
      );
    }

    // 4.1 Update special refund window if owner configured it (AC-38)
    if (input.specialRefundWindowStart && input.specialRefundWindowEnd) {
      const wStart = new Date(input.specialRefundWindowStart);
      const wEnd = new Date(input.specialRefundWindowEnd);
      if (Number.isNaN(wStart.getTime()) || Number.isNaN(wEnd.getTime())) {
        throw new Error('ช่วงเวลาขอคืนเงินพิเศษไม่ถูกต้อง');
      }
      if (wStart >= wEnd) {
        throw new Error('เวลาเริ่มต้นช่วงขอคืนเงินพิเศษต้องมาก่อนเวลาสิ้นสุด');
      }
      await client.query(
        `UPDATE event_sessions
         SET "specialRefundWindowStart" = $2,
             "specialRefundWindowEnd" = $3,
             "updatedAt" = now()
         WHERE id = $1`,
        [amd.sessionId, wStart, wEnd],
      );
    }

    // 5. Update or insert ticket types (AC-67, AC-68, AC-109)
    for (const item of ticketTypes) {
      if (item.id) {
        await client.query(
          `UPDATE ticket_types
           SET name = $2, price = $3, quota = $4, description = COALESCE($5, description), "updatedAt" = now()
           WHERE id = $1`,
          [item.id, item.name.trim(), item.price, item.quota, item.description || null],
        );
      } else {
        const newTtId = randomUUID();
        await client.query(
          `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
          [newTtId, amd.sessionId, item.name.trim(), item.price, item.quota, item.description || ''],
        );
      }
    }

    // 6. Mark amendment approved
    await client.query(
      `UPDATE session_amendments
       SET status = 'approved', "reviewedBy" = $2, "reviewedAt" = now(), "updatedAt" = now()
       WHERE id = $1`,
      [amd.id, input.ownerId],
    );

    return {
      success: true,
      message: 'อนุมัติการแก้ไขรอบการแสดงและราคาสำเร็จ ฉบับใหม่มีผลกับการซื้อรอบใหม่ทันที (AC-67, AC-68)',
    };
  });
}

/**
 * Configure special refund window for a session (Owner only — AC-38).
 */
export async function configureSpecialRefundWindow(
  pool: Pool,
  input: {
    sessionId: string;
    ownerId: string;
    specialRefundWindowStart: string | Date | null;
    specialRefundWindowEnd: string | Date | null;
  },
): Promise<{
  success: boolean;
  message: string;
  specialRefundWindowStart: string | null;
  specialRefundWindowEnd: string | null;
}> {
  await ensureEventSchema(pool);

  return inTransaction(pool, async client => {
    // 1. Role check: Owner only
    const userRes = await client.query('SELECT role FROM auth_user WHERE id = $1', [input.ownerId]);
    if (userRes.rowCount === 0 || userRes.rows[0].role !== 'owner') {
      throw new Error('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่สามารถกำหนดช่วงเวลาขอคืนเงินพิเศษได้ (AC-38)');
    }

    // 2. Validate window dates
    let wStart: Date | null = null;
    let wEnd: Date | null = null;

    if (input.specialRefundWindowStart && input.specialRefundWindowEnd) {
      wStart = new Date(input.specialRefundWindowStart);
      wEnd = new Date(input.specialRefundWindowEnd);
      if (Number.isNaN(wStart.getTime()) || Number.isNaN(wEnd.getTime())) {
        throw new Error('ช่วงเวลาขอคืนเงินพิเศษไม่ถูกต้อง');
      }
      if (wStart >= wEnd) {
        throw new Error('เวลาเริ่มต้นช่วงขอคืนเงินพิเศษต้องมาก่อนเวลาสิ้นสุด');
      }
    }

    // 3. Update event_sessions
    const res = await client.query(
      `UPDATE event_sessions
       SET "specialRefundWindowStart" = $2,
           "specialRefundWindowEnd" = $3,
           "updatedAt" = now()
       WHERE id = $1
       RETURNING id, "specialRefundWindowStart", "specialRefundWindowEnd"`,
      [input.sessionId, wStart, wEnd],
    );

    if (res.rowCount === 0) {
      throw new Error('ไม่พบรอบการแสดงที่ระบุ');
    }

    return {
      success: true,
      message: 'กำหนดช่วงเวลาขอคืนเงินพิเศษเรียบร้อยแล้ว (Special Refund Window — AC-38)',
      specialRefundWindowStart: wStart ? wStart.toISOString() : null,
      specialRefundWindowEnd: wEnd ? wEnd.toISOString() : null,
    };
  });
}

/**
 * Reject session amendment.
 */
export async function rejectSessionAmendment(
  pool: Pool,
  input: { amendmentId: string; ownerId: string; rejectionReason: string },
): Promise<{ success: boolean; message: string }> {
  await ensureEventSchema(pool);

  return inTransaction(pool, async client => {
    const userRes = await client.query('SELECT role FROM auth_user WHERE id = $1', [input.ownerId]);
    if (userRes.rowCount === 0 || userRes.rows[0].role !== 'owner') {
      throw new Error('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่สามารถปฏิเสธการแก้ไขรอบได้');
    }

    if (!input.rejectionReason?.trim()) {
      throw new Error('กรุณาระบุเหตุผลการปฏิเสธคำขอแก้ไข');
    }

    const amdRes = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM session_amendments WHERE id = $1 FOR UPDATE`,
      [input.amendmentId],
    );
    if (amdRes.rowCount === 0) {
      throw new Error('ไม่พบคำขอแก้ไขรอบการแสดงที่ระบุ');
    }

    if (amdRes.rows[0].status !== 'pending') {
      return { success: true, message: 'คำขอแก้ไขนี้ได้รับการดำเนินการไปแล้ว' };
    }

    await client.query(
      `UPDATE session_amendments
       SET status = 'rejected', "rejectionReason" = $2, "reviewedBy" = $3, "reviewedAt" = now(), "updatedAt" = now()
       WHERE id = $1`,
      [input.amendmentId, input.rejectionReason.trim(), input.ownerId],
    );

    return { success: true, message: 'ปฏิเสธคำขอแก้ไขรอบการแสดงเรียบร้อยแล้ว' };
  });
}

export interface SessionCancellationRecord {
  id: string;
  sessionId: string;
  eventId: string;
  organizerId: string;
  reason: string;
  status: string;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  startTime: string;
  endTime: string;
  sessionStatus: string;
  eventTitle: string;
  location: string;
  posterUrl?: string | null;
  organizerName: string;
  organizerEmail: string;
}

export interface SubmitSessionCancellationInput {
  sessionId: string;
  organizerId: string;
  reason: string;
}

export interface ApproveSessionCancellationInput {
  cancellationId: string;
  ownerId: string;
  now?: Date;
}

export interface ApproveSessionCancellationResult {
  success: boolean;
  sessionId: string;
  cancellationId: string;
  sessionStatus: string;
  alreadyApproved?: boolean;
  revokedTicketCount: number;
  refundCasesCreated: number;
  totalLiabilityAmount: number;
  cancelledReservationsCount?: number;
  message: string;
}

/**
 * Organizer submits cancellation request for a session (AC-35, AC-108).
 * Note: While request is pending, the session remains approved and active (AC-108).
 */
export async function submitSessionCancellation(
  pool: Pool,
  input: SubmitSessionCancellationInput,
): Promise<{ success: boolean; cancellationId: string; message: string }> {
  if (!input.reason?.trim()) {
    throw new Error('กรุณาระบุเหตุผลในการขอยกเลิกรอบการแสดง');
  }

  await ensureEventSchema(pool);

  return inTransaction(pool, async client => {
    // 1. Verify session exists and organizer owns the event
    const sessionRes = await client.query<{
      id: string;
      eventId: string;
      status: string;
      organizerId: string;
    }>(
      `SELECT es.id, es."eventId", es.status, e."organizerId"
       FROM event_sessions es
       JOIN events e ON e.id = es."eventId"
       WHERE es.id = $1`,
      [input.sessionId],
    );

    if (sessionRes.rowCount === 0) {
      throw new Error('ไม่พบรอบการแสดงที่ระบุ');
    }

    const session = sessionRes.rows[0];
    if (session.organizerId !== input.organizerId) {
      throw new Error('ไม่อนุญาต: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้');
    }

    if (session.status === 'cancelled') {
      throw new Error('รอบการแสดงนี้ถูกยกเลิกแล้ว');
    }

    // 2. Check if there is already a pending cancellation request
    const pendingRes = await client.query<{ id: string }>(
      `SELECT id FROM session_cancellations WHERE "sessionId" = $1 AND status = 'pending'`,
      [session.id],
    );
    if (pendingRes.rowCount && pendingRes.rowCount > 0) {
      throw new Error('มีคำขอยกเลิกรอบการแสดงนี้รอการพิจารณาอยู่แล้ว (AC-108)');
    }

    // 3. Create cancellation request
    const cancellationId = randomUUID();
    await client.query(
      `INSERT INTO session_cancellations (
         id, "sessionId", "eventId", "organizerId", reason, status, "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, 'pending', now(), now())`,
      [cancellationId, session.id, session.eventId, input.organizerId, input.reason.trim()],
    );

    return {
      success: true,
      cancellationId,
      message: 'ยื่นคำขอยกเลิกรอบการแสดงเรียบร้อยแล้ว รอการอนุมัติจากผู้ดูแลระบบ (AC-108)',
    };
  });
}

/**
 * List all pending session cancellations for Owner review.
 */
export async function listPendingSessionCancellations(pool: Pool): Promise<SessionCancellationRecord[]> {
  await ensureEventSchema(pool);

  const res = await pool.query<{
    id: string;
    sessionId: string;
    eventId: string;
    organizerId: string;
    reason: string;
    status: string;
    rejectionReason: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    startTime: Date;
    endTime: Date;
    sessionStatus: string;
    eventTitle: string;
    location: string;
    posterUrl: string | null;
    organizerName: string;
    organizerEmail: string;
  }>(
    `SELECT sc.id, sc."sessionId", sc."eventId", sc."organizerId", sc.reason, sc.status,
            sc."rejectionReason", sc."reviewedBy", sc."reviewedAt", sc."createdAt", sc."updatedAt",
            es."startTime", es."endTime", es.status AS "sessionStatus",
            e.title AS "eventTitle", e.location, e."posterUrl",
            u.name AS "organizerName", u.email AS "organizerEmail"
     FROM session_cancellations sc
     JOIN event_sessions es ON es.id = sc."sessionId"
     JOIN events e ON e.id = sc."eventId"
     JOIN auth_user u ON u.id = sc."organizerId"
     WHERE sc.status = 'pending'
     ORDER BY sc."createdAt" ASC`,
  );

  return res.rows.map(r => ({
    id: r.id,
    sessionId: r.sessionId,
    eventId: r.eventId,
    organizerId: r.organizerId,
    reason: r.reason,
    status: r.status,
    rejectionReason: r.rejectionReason,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt?.toISOString() || null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    startTime: r.startTime.toISOString(),
    endTime: r.endTime.toISOString(),
    sessionStatus: r.sessionStatus,
    eventTitle: r.eventTitle,
    location: r.location,
    posterUrl: r.posterUrl,
    organizerName: r.organizerName,
    organizerEmail: r.organizerEmail,
  }));
}

/**
 * Owner rejects session cancellation request.
 */
export async function rejectSessionCancellation(
  pool: Pool,
  input: { cancellationId: string; ownerId: string; rejectionReason: string },
): Promise<{ success: boolean; message: string }> {
  await ensureEventSchema(pool);

  return inTransaction(pool, async client => {
    const userRes = await client.query('SELECT role FROM auth_user WHERE id = $1', [input.ownerId]);
    if (userRes.rowCount === 0 || userRes.rows[0].role !== 'owner') {
      throw new Error('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่สามารถปฏิเสธคำขอยกเลิกรอบได้');
    }

    if (!input.rejectionReason?.trim()) {
      throw new Error('กรุณาระบุเหตุผลการปฏิเสธคำขอยกเลิกรอบการแสดง');
    }

    const cancelRes = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM session_cancellations WHERE id = $1 FOR UPDATE`,
      [input.cancellationId],
    );
    if (cancelRes.rowCount === 0) {
      throw new Error('ไม่พบคำขอยกเลิกรอบการแสดงที่ระบุ');
    }

    if (cancelRes.rows[0].status !== 'pending') {
      return { success: true, message: 'คำขอยกเลิกนี้ได้รับการดำเนินการไปแล้ว' };
    }

    await client.query(
      `UPDATE session_cancellations
       SET status = 'rejected', "rejectionReason" = $2, "reviewedBy" = $3, "reviewedAt" = now(), "updatedAt" = now()
       WHERE id = $1`,
      [input.cancellationId, input.rejectionReason.trim(), input.ownerId],
    );

    return { success: true, message: 'ปฏิเสธคำขอยกเลิกรอบการแสดงเรียบร้อยแล้ว' };
  });
}

/**
 * Owner approves session cancellation (AC-35, AC-91, AC-108, G-22, G-38, R5).
 * - Cancels session (status = 'cancelled')
 * - Rejects future checkouts/payments
 * - Automatically revokes eligible issued tickets (QR revoked)
 * - Automatically creates refund cases/liabilities for face value without customer fee (R5)
 * - Does not return quota for sale (AC-90)
 * - Preserves organizer flat fee (G-29)
 * - Strictly idempotent on repeated calls
 */
export async function approveSessionCancellation(
  pool: Pool,
  input: ApproveSessionCancellationInput,
): Promise<ApproveSessionCancellationResult> {
  await ensureEventSchema(pool);
  await ensureRefundSchema(pool);

  return inTransaction(pool, async client => {
    // 1. Verify owner role
    const userRes = await client.query<{ id: string; role: string; name: string }>(
      'SELECT id, role, name FROM auth_user WHERE id = $1',
      [input.ownerId],
    );
    if (userRes.rowCount === 0 || userRes.rows[0].role !== 'owner') {
      throw new Error('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่สามารถอนุมัติการยกเลิกรอบได้');
    }
    const owner = userRes.rows[0];

    // 2. Lock cancellation request FOR UPDATE
    const cancelRes = await client.query<{
      id: string;
      sessionId: string;
      eventId: string;
      status: string;
    }>(
      `SELECT id, "sessionId", "eventId", status
       FROM session_cancellations
       WHERE id = $1
       FOR UPDATE`,
      [input.cancellationId],
    );

    if (cancelRes.rowCount === 0) {
      throw new Error('ไม่พบคำขอยกเลิกรอบการแสดงที่ระบุ');
    }

    const cancelReq = cancelRes.rows[0];

    // Idempotent return if already approved
    if (cancelReq.status === 'approved') {
      return {
        success: true,
        cancellationId: cancelReq.id,
        sessionId: cancelReq.sessionId,
        sessionStatus: 'cancelled',
        alreadyApproved: true,
        revokedTicketCount: 0,
        refundCasesCreated: 0,
        totalLiabilityAmount: 0,
        message: 'คำขอยกเลิกรอบการแสดงได้รับการอนุมัติแล้ว',
      };
    }

    if (cancelReq.status !== 'pending') {
      throw new Error(`ไม่สามารถอนุมัติได้เนื่องจากคำขออยู่ในสถานะ "${cancelReq.status}"`);
    }

    const now = input.now || new Date();

    // 3. Lock session and update status to 'cancelled'
    const sessRes = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM event_sessions WHERE id = $1 FOR UPDATE`,
      [cancelReq.sessionId],
    );
    if (sessRes.rowCount === 0) {
      throw new Error('ไม่พบรอบการแสดงที่ผูกกับคำขอนี้');
    }

    await client.query(
      `UPDATE event_sessions
       SET status = 'cancelled', "updatedAt" = $2
       WHERE id = $1`,
      [cancelReq.sessionId, now],
    );

    // 4. Update cancellation request to 'approved'
    await client.query(
      `UPDATE session_cancellations
       SET status = 'approved', "reviewedBy" = $2, "reviewedAt" = $3, "updatedAt" = $3
       WHERE id = $1`,
      [cancelReq.id, owner.id, now],
    );

    // 5. Process automatic refunds for issued tickets (AC-35, AC-91, G-22, G-38, R5)
    const refundSummary = await processSessionCancellationRefunds(client, {
      sessionId: cancelReq.sessionId,
      eventId: cancelReq.eventId,
      ownerId: owner.id,
      ownerName: owner.name,
      now,
    });

    // 6. Terminate pending reservations and return held quota once without reopening sales (AC-112, G-50)
    const pendingOrdersRes = await client.query<{ id: string }>(
      `UPDATE orders
       SET status = 'cancelled', "updatedAt" = $2
       WHERE "sessionId" = $1 AND status = 'reserved'
       RETURNING id`,
      [cancelReq.sessionId, now],
    );
    const cancelledReservationsCount = pendingOrdersRes.rowCount || 0;

    return {
      success: true,
      cancellationId: cancelReq.id,
      sessionId: cancelReq.sessionId,
      sessionStatus: 'cancelled',
      alreadyApproved: false,
      revokedTicketCount: refundSummary.revokedTicketCount,
      refundCasesCreated: refundSummary.refundCasesCreated,
      totalLiabilityAmount: refundSummary.totalLiabilityAmount,
      cancelledReservationsCount,
      message: 'อนุมัติการยกเลิกรอบการแสดงและสร้างรายการคืนเงินอัตโนมัติเรียบร้อยแล้ว',
    };
  });
}
