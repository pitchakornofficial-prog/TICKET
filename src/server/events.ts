import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { inTransaction } from './database.ts';
import { ensureFeeSchema } from './fees.ts';
import { ensureReservationSchema } from './reservation.ts';
import { ensureRefundSchema, processSessionCancellationRefunds } from './refunds.ts';
import { ensureNewsSchema } from './news.ts';
import { ensureTicketSchema } from './tickets.ts';
import {
  ensureScannerAccessTokenSchema,
  issueScannerAccessTokenWithClient,
  revokeScannerAccessTokens,
} from './scanner-access.ts';

export type EventStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled';
export type SessionStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled';

export interface EventDraftInput {
  title: string;
  description?: string;
  location: string;
  posterUrl?: string;
  ticketTemplateUrl?: string;
  coverBannerUrl?: string;
  googleMapsUrl?: string;
  salesStartTime?: string;
  salesEndTime?: string;
  limitPerOrder?: number;
  ageRestriction?: string;
  refundPolicy?: string;
  entryGuidelines?: string;
  payoutAccountId?: string;
  payoutBankName?: string;
  payoutAccountNumber?: string;
  payoutAccountName?: string;
  ubuPrivilegeMode?: boolean;
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
    isStudentPrivilege?: boolean;
    studentPrice?: number | null;
  }[];
}

export interface PublicEventSummary {
  id: string;
  title: string;
  description?: string;
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

export interface PublicCatalogQueryOptions {
  q?: string;
  tab?: 'all' | 'available' | 'upcoming';
  location?: string;
  priceRange?: 'all' | 'under1500' | '1500to3000' | 'above3000';
  availability?: 'all' | 'available' | 'upcoming';
  sort?: 'date_asc' | 'price_asc' | 'price_desc';
  page?: number;
  limit?: number;
  includeLocations?: boolean;
}

export interface PublicCatalogLocationFacet {
  location: string;
  count: number;
}

export interface PublicEventCatalogResult {
  events: PublicEventSummary[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  locations: PublicCatalogLocationFacet[];
}

const eventSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureEventSchema(pool: Pool): Promise<void> {
  const existing = eventSchemaPromises.get(pool);
  if (existing) {
    return existing;
  }
  const promise = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          "organizerId" TEXT NOT NULL REFERENCES auth_user(id),
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL,
          "posterUrl" TEXT,
          "ticketTemplateUrl" TEXT,
          "coverBannerUrl" TEXT,
          "googleMapsUrl" TEXT,
          "salesStartTime" TIMESTAMPTZ,
          "salesEndTime" TIMESTAMPTZ,
          "limitPerOrder" INTEGER NOT NULL DEFAULT 4,
          status TEXT NOT NULL DEFAULT 'draft',
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "ticketTemplateUrl" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "coverBannerUrl" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "googleMapsUrl" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "salesStartTime" TIMESTAMPTZ;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "salesEndTime" TIMESTAMPTZ;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "ageRestriction" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "refundPolicy" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "entryGuidelines" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "payoutAccountId" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "payoutBankName" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "payoutAccountNumber" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "payoutAccountName" TEXT;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS "ubuPrivilegeMode" BOOLEAN NOT NULL DEFAULT FALSE;
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
        ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS "isStudentPrivilege" BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS "studentPrice" NUMERIC(12, 2);
        ALTER TABLE event_sessions ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

        CREATE TABLE IF NOT EXISTS event_scanners (
          id TEXT PRIMARY KEY,
          "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          "scannerId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
          "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE("eventId", "scannerId")
        );
        CREATE INDEX IF NOT EXISTS idx_event_scanners_scannerId ON event_scanners("scannerId");
        CREATE INDEX IF NOT EXISTS idx_event_scanners_eventId ON event_scanners("eventId");

        CREATE TABLE IF NOT EXISTS scanner_session_scopes (
          "sessionToken" TEXT PRIMARY KEY,
          "scannerId" TEXT NOT NULL,
          "eventId" TEXT NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_scanner_scopes_scanner ON scanner_session_scopes ("scannerId", "eventId");

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
        ALTER TABLE event_scanners ADD COLUMN IF NOT EXISTS "boundDeviceId" TEXT;
        ALTER TABLE event_scanners ADD COLUMN IF NOT EXISTS "boundAt" TIMESTAMPTZ;
      `);
      await ensureFeeSchema(pool);
      await ensureScannerAccessTokenSchema(pool);
    } catch (err) {
      eventSchemaPromises.delete(pool);
      throw err;
    }
  })();
  eventSchemaPromises.set(pool, promise);
  return promise;
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
      `INSERT INTO events (id, "organizerId", title, description, location, "posterUrl", "ticketTemplateUrl", "coverBannerUrl", "googleMapsUrl", "salesStartTime", "salesEndTime", "limitPerOrder", "ageRestriction", "refundPolicy", "entryGuidelines", "payoutAccountId", "payoutBankName", "payoutAccountNumber", "payoutAccountName", "ubuPrivilegeMode", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'draft', now(), now())`,
      [
        eventId,
        organizerId,
        eventInput.title.trim(),
        eventInput.description?.trim() || '',
        eventInput.location.trim(),
        eventInput.posterUrl || null,
        eventInput.ticketTemplateUrl || null,
        eventInput.coverBannerUrl || null,
        eventInput.googleMapsUrl || null,
        eventInput.salesStartTime ? new Date(eventInput.salesStartTime) : null,
        eventInput.salesEndTime ? new Date(eventInput.salesEndTime) : null,
        limit,
        eventInput.ageRestriction || 'all',
        eventInput.refundPolicy || 'refundable_7d',
        eventInput.entryGuidelines || null,
        eventInput.payoutAccountId || null,
        eventInput.payoutBankName || null,
        eventInput.payoutAccountNumber || null,
        eventInput.payoutAccountName || null,
        Boolean(eventInput.ubuPrivilegeMode),
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
          `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "isStudentPrivilege", "studentPrice", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
          [
            ttId,
            sessionId,
            tt.name.trim(),
            tt.price,
            tt.quota,
            tt.description || '',
            Boolean(tt.isStudentPrivilege),
            tt.studentPrice != null ? Number(tt.studentPrice) : null,
          ],
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
  isOwner = false,
) {
  await ensureEventSchema(pool);

  return inTransaction(pool, async client => {
    const check = await client.query('SELECT "organizerId", status FROM events WHERE id = $1', [eventId]);
    if (check.rowCount === 0) throw new Error('ไม่พบงานคอนเสิร์ต');
    if (!isOwner && check.rows[0].organizerId !== organizerId) {
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
    if (eventInput.coverBannerUrl !== undefined) {
      await client.query('UPDATE events SET "coverBannerUrl" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.coverBannerUrl, eventId]);
    }
    if (eventInput.googleMapsUrl !== undefined) {
      await client.query('UPDATE events SET "googleMapsUrl" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.googleMapsUrl, eventId]);
    }
    if (eventInput.salesStartTime !== undefined) {
      await client.query('UPDATE events SET "salesStartTime" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.salesStartTime ? new Date(eventInput.salesStartTime) : null, eventId]);
    }
    if (eventInput.salesEndTime !== undefined) {
      await client.query('UPDATE events SET "salesEndTime" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.salesEndTime ? new Date(eventInput.salesEndTime) : null, eventId]);
    }
    if (eventInput.limitPerOrder !== undefined) {
      await client.query('UPDATE events SET "limitPerOrder" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.limitPerOrder, eventId]);
    }
    if (eventInput.ageRestriction !== undefined) {
      await client.query('UPDATE events SET "ageRestriction" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.ageRestriction, eventId]);
    }
    if (eventInput.refundPolicy !== undefined) {
      await client.query('UPDATE events SET "refundPolicy" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.refundPolicy, eventId]);
    }
    if (eventInput.entryGuidelines !== undefined) {
      await client.query('UPDATE events SET "entryGuidelines" = $1, "updatedAt" = now() WHERE id = $2', [eventInput.entryGuidelines, eventId]);
    }
    if (eventInput.payoutAccountId !== undefined) {
      await client.query('UPDATE events SET "payoutAccountId" = $1, "payoutBankName" = $2, "payoutAccountNumber" = $3, "payoutAccountName" = $4, "updatedAt" = now() WHERE id = $5', [eventInput.payoutAccountId, eventInput.payoutBankName || null, eventInput.payoutAccountNumber || null, eventInput.payoutAccountName || null, eventId]);
    }
    if (eventInput.ubuPrivilegeMode !== undefined) {
      await client.query('UPDATE events SET "ubuPrivilegeMode" = $1, "updatedAt" = now() WHERE id = $2', [Boolean(eventInput.ubuPrivilegeMode), eventId]);
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
            `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "isStudentPrivilege", "studentPrice", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
            [
              ttId,
              sessionId,
              tt.name.trim(),
              tt.price,
              tt.quota,
              tt.description || '',
              Boolean(tt.isStudentPrivilege),
              tt.studentPrice != null ? Number(tt.studentPrice) : null,
            ],
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
      `SELECT s.id, s."eventId", e."organizerId" 
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
    await client.query(
      `UPDATE events SET status = 'pending_approval', "updatedAt" = now() WHERE id = $1 AND status = 'draft'`,
      [res.rows[0].eventId],
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
            e.description AS "eventDescription", e."googleMapsUrl", e."salesStartTime", e."salesEndTime",
            e."limitPerOrder", e."ageRestriction", e."refundPolicy", e."entryGuidelines",
            e."payoutAccountId", e."payoutBankName", e."payoutAccountNumber", e."payoutAccountName",
            e."ubuPrivilegeMode",
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

export async function rejectSession(
  pool: Pool,
  sessionId: string,
  ownerId: string,
  reason: string,
) {
  await ensureEventSchema(pool);
  return inTransaction(pool, async client => {
    const userRes = await client.query('SELECT role FROM auth_user WHERE id = $1', [ownerId]);
    if (userRes.rowCount === 0 || userRes.rows[0].role !== 'owner') {
      throw new Error('ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้นที่สามารถปฏิเสธรอบการแสดงได้');
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
      `UPDATE event_sessions SET status = 'draft', "rejectionReason" = $2, "updatedAt" = now() WHERE id = $1`,
      [sessionId, reason.trim()],
    );

    await client.query(
      `UPDATE events SET status = 'draft', "updatedAt" = now() WHERE id = $1`,
      [sessRes.rows[0].eventId],
    );

    return { success: true, sessionId, eventId: sessRes.rows[0].eventId, reason: reason.trim() };
  });
}

export async function listOrganizerEvents(pool: Pool, organizerId: string) {
  await ensureEventSchema(pool);
  const res = await pool.query(
    `SELECT e.*, 
            COUNT(DISTINCT s.id) AS "sessionCount",
            COALESCE(SUM(tt.quota), 0) AS "totalQuota",
            MIN(tt.price) AS "minPrice",
            MAX(tt.price) AS "maxPrice",
            MIN(s."startTime") AS "firstSessionStartTime",
            MAX(s."endTime") AS "lastSessionEndTime"
     FROM events e
     LEFT JOIN event_sessions s ON s."eventId" = e.id
     LEFT JOIN ticket_types tt ON tt."sessionId" = s.id
     WHERE e."organizerId" = $1
     GROUP BY e.id
     ORDER BY e."createdAt" DESC`,
    [organizerId],
  );
  return res.rows;
}

export async function listAllEventsForOwner(pool: Pool) {
  await ensureEventSchema(pool);
  const res = await pool.query(
    `SELECT e.*, 
            COUNT(DISTINCT s.id) AS "sessionCount",
            COALESCE(SUM(tt.quota), 0) AS "totalQuota",
            MIN(tt.price) AS "minPrice",
            MAX(tt.price) AS "maxPrice",
            MIN(s."startTime") AS "firstSessionStartTime",
            MAX(s."endTime") AS "lastSessionEndTime"
     FROM events e
     LEFT JOIN event_sessions s ON s."eventId" = e.id
     LEFT JOIN ticket_types tt ON tt."sessionId" = s.id
     GROUP BY e.id
     ORDER BY e."createdAt" DESC`,
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
        AND ($1::text IS NULL OR e.title ILIKE '%' || $1 || '%' OR e.location ILIKE '%' || $1 || '%' OR COALESCE(e.description, '') ILIKE '%' || $1 || '%')
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

/**
 * Queries the public concert catalog with server-side filtering (including event description search),
 * sorting, and pagination without shipping event descriptions over the wire.
 */
export async function queryPublicEventsCatalog(
  pool: Pool,
  options: PublicCatalogQueryOptions = {},
): Promise<PublicEventCatalogResult> {
  const page = Math.max(1, Math.floor(options.page || 1));
  const limit = Math.min(48, Math.max(1, Math.floor(options.limit || 12)));
  const offset = (page - 1) * limit;
  const search = options.q?.trim() ? options.q.trim() : null;
  const locationFilter =
    options.location && options.location !== 'all' ? options.location.trim() : null;
  const priceRange = options.priceRange || 'all';
  const effectiveAvailability =
    search !== null
      ? options.availability || 'all'
      : options.tab && options.tab !== 'all'
        ? options.tab
        : options.availability || 'all';
  const sort = options.sort || 'date_asc';

  const orderByClause =
    sort === 'price_asc'
      ? '"startingPrice" ASC, "earliestStartTime" ASC'
      : sort === 'price_desc'
        ? '"startingPrice" DESC, "earliestStartTime" ASC'
        : '"earliestStartTime" ASC';

  try {
    await ensureEventSchema(pool);
    const catalogPromise = pool.query<{
      id: string;
      title: string;
      location: string;
      posterUrl: string | null;
      limitPerOrder: number;
      status: string;
      earliestStartTime: Date;
      latestEndTime: Date;
      startingPrice: string | number;
      approvedSessionCount: number;
      totalQuota: number;
      fullCount: number;
    }>(
      `WITH event_agg AS (
         SELECT
           e.id,
           e.title,
           COALESCE(e.description, '') AS description_text,
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
         GROUP BY e.id, e.title, e.description, e.location, e."posterUrl", e."limitPerOrder", e.status
       ),
       filtered AS (
         SELECT
           id, title, location, "posterUrl", "limitPerOrder", status,
           "earliestStartTime", "latestEndTime", "startingPrice",
           "approvedSessionCount", "totalQuota"
         FROM event_agg
         WHERE (
           $1::text IS NULL
           OR title ILIKE '%' || $1 || '%'
           OR location ILIKE '%' || $1 || '%'
           OR description_text ILIKE '%' || $1 || '%'
         )
           AND ($2::text IS NULL OR TRIM(location) = $2)
           AND (
             $3::text = 'all'
             OR ($3 = 'under1500' AND "startingPrice" <= 1500)
             OR ($3 = '1500to3000' AND "startingPrice" > 1500 AND "startingPrice" <= 3000)
             OR ($3 = 'above3000' AND "startingPrice" > 3000)
           )
           AND (
             $4::text = 'all'
             OR ($4 = 'available' AND "totalQuota" > 0)
             OR ($4 = 'upcoming' AND "earliestStartTime" > now())
           )
       )
       SELECT *, COUNT(*) OVER()::int AS "fullCount"
       FROM filtered
       ORDER BY ${orderByClause}
       LIMIT $5 OFFSET $6`,
      [search, locationFilter, priceRange, effectiveAvailability, limit, offset],
    );

    const locationsPromise =
      options.includeLocations === false
        ? Promise.resolve(null)
        : pool.query<{ location: string; count: number }>(
            `SELECT TRIM(e.location) AS location, COUNT(DISTINCT e.id)::int AS count
             FROM events e
             JOIN event_sessions s ON s."eventId" = e.id AND s.status = 'approved'
             WHERE e.status = 'approved' AND TRIM(COALESCE(e.location, '')) <> ''
             GROUP BY TRIM(e.location)
             ORDER BY TRIM(e.location) ASC`,
          );

    const [catalogRes, locRes] = await Promise.all([catalogPromise, locationsPromise]);
    const totalCount =
      catalogRes.rows[0]?.fullCount ??
      (page === 1 ? 0 : (await pool.query<{ total: number }>(
        `SELECT COUNT(DISTINCT e.id)::int AS total
         FROM events e
         JOIN event_sessions s ON s."eventId" = e.id AND s.status = 'approved'
         WHERE e.status = 'approved'
           AND ($1::text IS NULL OR e.title ILIKE '%' || $1 || '%' OR e.location ILIKE '%' || $1 || '%' OR COALESCE(e.description, '') ILIKE '%' || $1 || '%')`,
        [search],
      )).rows[0]?.total ?? 0);

    const events: PublicEventSummary[] = catalogRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      location: r.location,
      posterUrl: r.posterUrl,
      limitPerOrder: Number(r.limitPerOrder),
      status: r.status,
      earliestStartTime:
        r.earliestStartTime instanceof Date
          ? r.earliestStartTime.toISOString()
          : String(r.earliestStartTime),
      latestEndTime:
        r.latestEndTime instanceof Date ? r.latestEndTime.toISOString() : String(r.latestEndTime),
      startingPrice: Number(r.startingPrice),
      approvedSessionCount: Number(r.approvedSessionCount),
      totalQuota: Number(r.totalQuota),
    }));

    return {
      events,
      totalCount,
      page,
      limit,
      hasMore: offset + events.length < totalCount,
      locations: locRes ? locRes.rows : [],
    };
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'ECONNREFUSED') {
      console.warn('[TICKET] ฐานข้อมูล PostgreSQL ยังไม่พร้อมทำงานที่ 127.0.0.1:55432 (รัน "npm run db:up" เพื่อเปิดใช้งาน)');
    } else {
      console.error('Failed to query public event catalog:', error);
    }
    return { events: [], totalCount: 0, page, limit, hasMore: false, locations: [] };
  }
}

export async function getPublicEventWithApprovedSessions(pool: Pool, eventId: string) {
  try {
    await ensureEventSchema(pool);
    const evRes = await pool.query(
      `SELECT e.id, e.title, e.description, e.location, e."posterUrl", e."ticketTemplateUrl", e."limitPerOrder", e.status,
              e."salesStartTime", e."salesEndTime",
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

    if (sessRes.rows.length === 0) {
      return { ...event, sessions: [] };
    }

    const sessionIds = sessRes.rows.map(s => s.id as string);
    const hasOrderTablesRes = await pool.query(
      "SELECT to_regclass('public.orders') as orders, to_regclass('public.order_items') as items, to_regclass('public.tickets') as tickets",
    );
    const canCheckHeld = Boolean(hasOrderTablesRes.rows[0]?.orders && hasOrderTablesRes.rows[0]?.items);
    const canCheckTickets = Boolean(hasOrderTablesRes.rows[0]?.tickets);

    // Single batched query across all sessions with pre-aggregated held & refunded counts (#4)
    const ttQuery = canCheckHeld
      ? `WITH target_tt AS (
           SELECT id
           FROM ticket_types
           WHERE "sessionId" = ANY($1::text[])
         ),
         held_agg AS (
           SELECT oi."ticketTypeId", COALESCE(SUM(oi.quantity), 0)::int AS held_qty
           FROM order_items oi
           JOIN orders o ON oi."orderId" = o.id
           JOIN target_tt ttt ON ttt.id = oi."ticketTypeId"
           WHERE o.status = 'paid' OR (o.status = 'reserved' AND o."expiresAt" > now())
           GROUP BY oi."ticketTypeId"
         )${
           canCheckTickets
             ? `,
         refund_agg AS (
           SELECT t."ticketTypeId", COUNT(*)::int AS refunded_qty
           FROM tickets t
           JOIN target_tt ttt ON ttt.id = t."ticketTypeId"
           WHERE t.status = 'refunded'
           GROUP BY t."ticketTypeId"
         )`
             : ''
         }
         SELECT tt.id, tt."sessionId", tt.name, tt.price, tt.description,
                tt."isStudentPrivilege", tt."studentPrice",
                GREATEST(0, tt.quota - GREATEST(0, COALESCE(ha.held_qty, 0) - ${
                  canCheckTickets ? 'COALESCE(ra.refunded_qty, 0)' : '0'
                })) AS quota
         FROM ticket_types tt
         LEFT JOIN held_agg ha ON ha."ticketTypeId" = tt.id
         ${canCheckTickets ? 'LEFT JOIN refund_agg ra ON ra."ticketTypeId" = tt.id' : ''}
         WHERE tt."sessionId" = ANY($1::text[])
         ORDER BY tt."sessionId" ASC, tt.price ASC`
      : `SELECT id, "sessionId", name, price, quota, description, "isStudentPrivilege", "studentPrice"
         FROM ticket_types
         WHERE "sessionId" = ANY($1::text[])
         ORDER BY "sessionId" ASC, price ASC`;

    const ttRes = await pool.query(ttQuery, [sessionIds]);

    const ttBySession = new Map<
      string,
      Array<{
        id: string;
        name: string;
        price: number;
        quota: number;
        description: string | null;
        isStudentPrivilege: boolean;
        studentPrice: number | null;
      }>
    >();

    for (const row of ttRes.rows) {
      const list = ttBySession.get(row.sessionId) || [];
      list.push({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        quota: Number(row.quota),
        description: row.description ?? null,
        isStudentPrivilege: Boolean(row.isStudentPrivilege),
        studentPrice: row.studentPrice != null ? Number(row.studentPrice) : null,
      });
      ttBySession.set(row.sessionId, list);
    }

    const sessions = sessRes.rows.map(sess => ({
      ...sess,
      ticketTypes: ttBySession.get(sess.id) || [],
    }));

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
  isBound?: boolean;
  boundDeviceId?: string | null;
  boundAt?: string | null;
  hasActiveToken?: boolean;
  tokenExpiresAt?: string | null;
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

        // Security check: verify password for existing scanner to prevent unauthorized account hijacking
        if (!data.password) {
          throw new Error('บัญชีทีมสแกนนี้มีอยู่ในระบบแล้ว กรุณาระบุรหัสผ่านที่ถูกต้องของบัญชีเพื่อยืนยันการเพิ่มเข้างาน');
        }
        const accRes = await client.query<{ password: string }>(
          'SELECT password FROM auth_account WHERE "userId" = $1 AND "providerId" = $2',
          [existing.id, 'credential'],
        );
        if (accRes.rowCount === 0 || !accRes.rows[0].password) {
          throw new Error('ไม่พบข้อมูลรหัสผ่านสำหรับบัญชีเดิม');
        }
        const isMatch = await verifyPassword({
          hash: accRes.rows[0].password,
          password: data.password,
        });
        if (!isMatch) {
          throw new Error('รหัสผ่านของบัญชีทีมสแกนเดิมไม่ถูกต้อง');
        }

        targetScannerId = existing.id;
        targetName = existing.name;
      } else {
        targetScannerId = randomUUID();
        const pwd = data.password || `Scanner!${randomBytes(16).toString('hex')}`;
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
    boundDeviceId: string | null;
    boundAt: Date | null;
    activeTokenExpiresAt: Date | null;
  }>(
    `SELECT es.id, es."scannerId", u.name, u.email, es."assignedAt",
            (ps."scannerId" IS NOT NULL) as "isPrimary",
            es."boundDeviceId", es."boundAt",
            (
              SELECT sat."expiresAt"
              FROM scanner_access_tokens sat
              WHERE sat."eventId" = es."eventId"
                AND sat."scannerId" = es."scannerId"
                AND sat."usedAt" IS NULL
                AND sat."revokedAt" IS NULL
                AND sat."expiresAt" > now()
              ORDER BY sat."createdAt" DESC
              LIMIT 1
            ) as "activeTokenExpiresAt"
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
    isBound: Boolean(r.boundDeviceId),
    boundDeviceId: r.boundDeviceId,
    boundAt: r.boundAt ? (r.boundAt instanceof Date ? r.boundAt.toISOString() : String(r.boundAt)) : null,
    hasActiveToken: Boolean(r.activeTokenExpiresAt),
    tokenExpiresAt: r.activeTokenExpiresAt
      ? (r.activeTokenExpiresAt instanceof Date
          ? r.activeTokenExpiresAt.toISOString()
          : String(r.activeTokenExpiresAt))
      : null,
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

  return inTransaction(pool, async (client) => {
    await revokeScannerAccessTokens(client, eventId, scannerId);

    // Revoke any scoped sessions for this scanner on this event
    await client.query(
      `DELETE FROM auth_session
       WHERE token IN (
         SELECT "sessionToken"
         FROM scanner_session_scopes
         WHERE "scannerId" = $1 AND "eventId" = $2
       )`,
      [scannerId, eventId],
    );
    await client.query(
      'DELETE FROM scanner_session_scopes WHERE "scannerId" = $1 AND "eventId" = $2',
      [scannerId, eventId],
    );

    const result = await client.query(
      'DELETE FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2',
      [eventId, scannerId],
    );

    return (result.rowCount ?? 0) > 0;
  });
}

export async function updateScannerName(
  pool: Pool,
  organizerId: string,
  eventId: string,
  scannerId: string,
  newName: string,
): Promise<{ id: string; name: string }> {
  await ensureEventSchema(pool);

  const evRes = await pool.query<{ organizerId: string }>('SELECT "organizerId" FROM events WHERE id = $1', [eventId]);
  if (evRes.rowCount === 0) throw new Error('ไม่พบงานคอนเสิร์ต');
  if (evRes.rows[0].organizerId !== organizerId) {
    throw new Error('คุณไม่มีสิทธิ์จัดการทีมสแกนของงานนี้');
  }

  const trimmedName = newName.trim();
  if (!trimmedName) {
    throw new Error('กรุณาระบุชื่อเจ้าหน้าที่หรือจุดตรวจ');
  }

  const scRes = await pool.query('SELECT id FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2', [eventId, scannerId]);
  if ((scRes.rowCount ?? 0) === 0) {
    throw new Error('ไม่พบข้อมูลทีมสแกนในงานนี้');
  }

  await inTransaction(pool, async client => {
    await client.query('UPDATE auth_user SET name = $1, "updatedAt" = now() WHERE id = $2', [trimmedName, scannerId]);
    await client.query('UPDATE event_primary_scanners SET "scannerName" = $1 WHERE "eventId" = $2 AND "scannerId" = $3', [trimmedName, eventId, scannerId]);
  });

  return { id: scannerId, name: trimmedName };
}

export async function resetScannerDeviceBinding(
  pool: Pool,
  organizerId: string,
  eventId: string,
  scannerId: string,
): Promise<{ success: boolean; message: string; accessUrl: string; expiresAt: string }> {
  await ensureEventSchema(pool);
  const evRes = await pool.query<{ organizerId: string }>(
    'SELECT "organizerId" FROM events WHERE id = $1',
    [eventId],
  );
  if (evRes.rowCount === 0) throw new Error('ไม่พบงานคอนเสิร์ต');
  if (evRes.rows[0].organizerId !== organizerId) {
    throw new Error('คุณไม่มีสิทธิ์จัดการงานคอนเสิร์ตนี้');
  }

  const scRes = await pool.query(
    'SELECT id FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2',
    [eventId, scannerId],
  );
  if ((scRes.rowCount ?? 0) === 0) {
    throw new Error('ไม่พบทีมสแกนในงานนี้');
  }

  const issued = await inTransaction(pool, async (client) => {
    // 1. Clear bound device on event_scanners
    await client.query(
      `UPDATE event_scanners
       SET "boundDeviceId" = NULL, "boundAt" = NULL
       WHERE "eventId" = $1 AND "scannerId" = $2`,
      [eventId, scannerId],
    );

    // 2. Invalidate all active sessions and event scopes for this scanner
    await client.query(
      `DELETE FROM auth_session WHERE "userId" = $1`,
      [scannerId],
    );
    await client.query(
      `DELETE FROM scanner_session_scopes WHERE "scannerId" = $1 AND "eventId" = $2`,
      [scannerId, eventId],
    );

    // 3. Revoke prior tokens and issue a fresh single-use access token
    return issueScannerAccessTokenWithClient(client, {
      eventId,
      scannerId,
      createdBy: organizerId,
    });
  });

  return {
    success: true,
    message: 'รีเซ็ตอุปกรณ์เรียบร้อยแล้ว พร้อมออกลิงก์ใหม่สำหรับอุปกรณ์ใหม่ (ลิงก์เดิมถูกเพิกถอนแล้ว)',
    accessUrl: issued.accessUrl,
    expiresAt: issued.expiresAt,
  };
}

export async function listEventsForScanner(
  pool: Pool,
  scannerId: string,
  role: string = 'scanner',
): Promise<ScannerAssignedEvent[]> {
  await ensureEventSchema(pool);

  let evRes: {
    rows: Array<{
      id: string;
      title: string;
      location: string;
      posterUrl: string | null;
      status: string;
      assignedAt: Date;
      primaryScannerId: string | null;
      primaryScannerName: string | null;
    }>;
  };

  if (role === 'organizer') {
    evRes = await pool.query(
      `SELECT e.id, e.title, e.location, e."posterUrl", e.status, e."createdAt" as "assignedAt",
              e."organizerId" as "primaryScannerId", u.name as "primaryScannerName"
       FROM events e
       JOIN auth_user u ON u.id = e."organizerId"
       WHERE e."organizerId" = $1
       ORDER BY e."createdAt" DESC`,
      [scannerId],
    );
  } else if (role === 'owner') {
    evRes = await pool.query(
      `SELECT e.id, e.title, e.location, e."posterUrl", e.status, e."createdAt" as "assignedAt",
              e."organizerId" as "primaryScannerId", u.name as "primaryScannerName"
       FROM events e
       JOIN auth_user u ON u.id = e."organizerId"
       ORDER BY e."createdAt" DESC`,
    );
  } else {
    evRes = await pool.query(
      `SELECT e.id, e.title, e.location, e."posterUrl", e.status, es."assignedAt",
              ps."scannerId" as "primaryScannerId", ps."scannerName" as "primaryScannerName"
       FROM events e
       JOIN event_scanners es ON es."eventId" = e.id
       LEFT JOIN event_primary_scanners ps ON ps."eventId" = e.id
       WHERE es."scannerId" = $1
       ORDER BY es."assignedAt" DESC`,
      [scannerId],
    );
  }

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
      isPrimary: role === 'organizer' || role === 'owner' || ev.primaryScannerId === scannerId,
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
  isStudentPrivilege?: boolean;
  studentPrice?: number | null;
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
  await ensureTicketSchema(pool);

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
            `โควตาใหม่ (${item.quota}) สำหรับประเภทบัตร "${item.name}" น้อยกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้ว (${currentHeld} ใบ) ไม่สามารถลดโควตาต่ำกว่านี้ได้`,
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
  await ensureTicketSchema(pool);

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
  await ensureTicketSchema(pool);

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
            `โควตาใหม่ (${item.quota}) สำหรับประเภทบัตร "${item.name}" น้อยกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้ว (${currentHeld} ใบ) ไม่สามารถลดโควตาได้`,
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
           SET name = $2, price = $3, quota = $4, description = COALESCE($5, description),
               "isStudentPrivilege" = COALESCE($6, "isStudentPrivilege"),
               "studentPrice" = $7,
               "updatedAt" = now()
           WHERE id = $1`,
          [
            item.id,
            item.name.trim(),
            item.price,
            item.quota,
            item.description || null,
            item.isStudentPrivilege != null ? Boolean(item.isStudentPrivilege) : null,
            item.studentPrice != null ? Number(item.studentPrice) : null,
          ],
        );
      } else {
        const newTtId = randomUUID();
        await client.query(
          `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "isStudentPrivilege", "studentPrice", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
          [
            newTtId,
            amd.sessionId,
            item.name.trim(),
            item.price,
            item.quota,
            item.description || '',
            Boolean(item.isStudentPrivilege),
            item.studentPrice != null ? Number(item.studentPrice) : null,
          ],
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
      message: 'อนุมัติการแก้ไขรอบการแสดงและราคาสำเร็จ ฉบับใหม่มีผลกับการซื้อรอบใหม่ทันที',
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
      throw new Error('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่สามารถกำหนดช่วงเวลาขอคืนเงินพิเศษได้');
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
      message: 'กำหนดช่วงเวลาขอคืนเงินพิเศษเรียบร้อยแล้ว (Special Refund Window)',
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
      throw new Error('มีคำขอยกเลิกรอบการแสดงนี้รอการพิจารณาอยู่แล้ว');
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
      message: 'ยื่นคำขอยกเลิกรอบการแสดงเรียบร้อยแล้ว รอการอนุมัติจากผู้ดูแลระบบ',
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


/**
 * Idempotently seeds the UBU Freshy Music Fest 2026 event, organizer user,
 * session, ticket type, and custom fee model (D-181).
 */
export async function seedUbuFreshyFest(
  pool: Pool,
  options?: { organizerPassword?: string },
): Promise<void> {
  const configuredPassword =
    options?.organizerPassword?.trim() || process.env.SEED_UBU_ORGANIZER_PASSWORD?.trim();
  if (configuredPassword && (configuredPassword.length < 15 || configuredPassword.length > 128)) {
    throw new Error('SEED_UBU_ORGANIZER_PASSWORD ต้องมีความยาว 15-128 ตัวอักษร');
  }
  if (!configuredPassword && process.env.NODE_ENV === 'production') {
    throw new Error('ต้องระบุ SEED_UBU_ORGANIZER_PASSWORD เมื่อ seed บัญชีผู้จัดงานใน production');
  }

  try {
    const organizerId = 'org-freshy-fest-ubu';
    const eventId = 'event-ubu-freshy-2026';
    const sessionId = 'session-ubu-freshy-2026-s1';
    const ticketTypeId = 'tt-ubu-freshy-ga';

    // 1. Ensure dedicated organizer account
    await pool.query(
      `INSERT INTO auth_user (id, email, name, role, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'organizer', true, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [organizerId, 'organizer.freshy@ubu.ac.th', 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี'],
    );
    const accCheck = await pool.query('SELECT id FROM auth_account WHERE "userId" = $1', [organizerId]);
    if (accCheck.rowCount === 0) {
      const initialPassword = configuredPassword || `UbuOrg!${randomBytes(18).toString('base64url')}`;
      const hashedPassword = await hashPassword(initialPassword);
      await pool.query(
        'INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, now(), now())',
        ['acc-freshy-fest-ubu', organizerId, 'credential', organizerId, hashedPassword],
      );
    }

    // 2. Ensure event
    await pool.query(
      `INSERT INTO events (
         id, "organizerId", title, description, location,
         "posterUrl", "coverBannerUrl", status, "limitPerOrder",
         "createdAt", "updatedAt"
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, 'approved', 4,
         now(), now()
       )
       ON CONFLICT (id) DO UPDATE SET
         status = 'approved',
         title = EXCLUDED.title,
         location = EXCLUDED.location,
         description = EXCLUDED.description`,
      [
        eventId,
        organizerId,
        'UBU Freshy Music Fest 2026',
        'เทศกาลดนตรีต้อนรับเพื่อนใหม่ มหาวิทยาลัยอุบลราชธานี รวมพลศิลปินและกิจกรรมสุดมันส์ พิเศษสำหรับนักศึกษาและบุคลากร ม.อุบลฯ รับสิทธิ์ซื้อบัตรราคา 99 บาท (ราคาปกติ 150 บาท)',
        'ศูนย์กีฬาและนันทนาการ มหาวิทยาลัยอุบลราชธานี',
        'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1600&q=80',
      ],
    );

    // 3. Ensure approved session
    const startTime = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 6 * 60 * 60 * 1000);
    const admissionStartTime = new Date(startTime.getTime() - 60 * 60 * 1000);
    const admissionEndTime = new Date(startTime.getTime() + 4 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO event_sessions (
         id, "eventId", "startTime", "endTime",
         "admissionStartTime", "admissionEndTime", status,
         "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'approved', now(), now())
       ON CONFLICT (id) DO UPDATE SET status = 'approved'`,
      [sessionId, eventId, startTime, endTime, admissionStartTime, admissionEndTime],
    );

    // 4. Ensure single ticket type: 150 THB, quota 4500, student privilege 99 THB
    await pool.query(
      `INSERT INTO ticket_types (
         id, "sessionId", name, price, quota, description, "isStudentPrivilege", "studentPrice",
         "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, 150, 4500, $4, TRUE, 99, now(), now())
       ON CONFLICT (id) DO UPDATE SET price = 150, quota = 4500, "isStudentPrivilege" = TRUE, "studentPrice" = 99`,
      [
        ticketTypeId,
        sessionId,
        'General Admission (บัตรเข้างานทั่วไป)',
        'บัตรเข้างานราคาปกติ 150 บาท (ชาว ม.อุบลฯ ใช้อีเมล @ubu.ac.th ลดเหลือ 99 บาททุกใบ)',
      ],
    );

    // 5. Ensure Fee Settings (Customer 6%, Organizer 2% regular / 3% privilege, UBU Privilege Mode on)
    await pool.query(
      `INSERT INTO event_fee_settings (
         "eventId", "organizerFeeMode", "organizerFeeRate", "organizerFeePrivilegeRate",
         "ubuPrivilegeMode", "customerFeeMode", "customerFeeRate", "reservePercentage",
         "organizerFeeLocked", "createdAt", "updatedAt"
       )
       VALUES ($1, 'percentage', 2, 3, TRUE, 'percentage', 6, 10, FALSE, now(), now())
       ON CONFLICT ("eventId") DO UPDATE SET
         "customerFeeRate" = 6,
         "customerFeeMode" = 'percentage',
         "organizerFeeRate" = 2,
         "organizerFeePrivilegeRate" = 3,
         "ubuPrivilegeMode" = TRUE`,
      [eventId],
    );

    // 6. Ensure 3 published club news articles created by UBU Club (D-187)
    await ensureNewsSchema(pool);
    const newsArticles = [
      {
        id: 'news-ubu-freshy-ticket-open',
        title: 'เปิดจำหน่ายบัตร UBU Freshy Music Fest 2026 ราคาพิเศษสำหรับนักศึกษา 99 บาท',
        content:
          'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี ขอเชิญชวนเพื่อนๆ นักศึกษาและบุคลากรทุกท่าน ร่วมเป็นส่วนหนึ่งของค่ำคืนสุดประทับใจในเทศกาลดนตรีต้อนรับเพื่อนใหม่ UBU Freshy Music Fest 2026 โดยสิทธิพิเศษสำหรับชาว ม.อุบลฯ เมื่อใช้อีเมล @ubu.ac.th รับสิทธิ์ซื้อบัตรในราคาพิเศษเพียง 99 บาท (จากราคาปกติ 150 บาท) บัตรมีจำนวนจำกัด รีบจับจองก่อนหมด!',
        coverUrl:
          'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
        publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'news-ubu-freshy-lineup',
        title: 'เปิดไลน์อัปศิลปินและวงดนตรีสุดมันส์ UBU Freshy Music Fest 2026',
        content:
          'เตรียมพบกับทัพศิลปินชื่อดังและวงดนตรีตัวแทนนักศึกษา ที่จะมาร่วมสร้างสีสันและความสนุกแบบจัดเต็มตลอด 6 ชั่วโมงเต็ม ณ อาคารศูนย์กีฬาและนันทนาการ มหาวิทยาลัยอุบลราชธานี ติดตามตารางการแสดงและรายละเอียดเพิ่มเติมได้เร็วๆ นี้',
        coverUrl:
          'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1600&q=80',
        publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'news-ubu-freshy-entry-guidelines',
        title: 'ข้อปฏิบัติและจุดตรวจเข้างาน UBU Freshy Music Fest 2026',
        content:
          'เพื่อความปลอดภัยและความสะดวกรวดเร็วในการเข้างาน ผู้เข้าร่วมงานทุกท่านกรุณาเตรียม E-Ticket พร้อมบัตรประจำตัวประชาชนหรือบัตรนักศึกษาเพื่อแสดงต่อทีมงานสแกนบัตร ณ จุดคัดกรองบริเวณประตูทางเข้าหลัก โดยประตูเปิดให้เข้าพื้นที่ตั้งแต่เวลา 16:00 น. เป็นต้นไป',
        coverUrl:
          'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
        publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ];

    for (const item of newsArticles) {
      await pool.query(
        `INSERT INTO news (id, title, content, status, "coverUrl", "publishedAt", "authorId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'published', $4, $5, $6, now(), now())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           status = 'published',
           "coverUrl" = EXCLUDED."coverUrl",
           "publishedAt" = EXCLUDED."publishedAt",
           "authorId" = EXCLUDED."authorId"`,
        [item.id, item.title, item.content, item.coverUrl, item.publishedAt, organizerId],
      );
    }

    // 7. Ensure event_payouts schema exists (D-185: do not seed fake payout records)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_payouts (
        id TEXT PRIMARY KEY,
        "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        amount NUMERIC(12, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        "paidAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "transferProofKey" TEXT,
        "transferProofUrl" TEXT,
        "transferNote" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "recordedBy" TEXT REFERENCES auth_user(id)
      );
      CREATE INDEX IF NOT EXISTS idx_event_payouts_eventId ON event_payouts("eventId");
    `);

    // 8. Definition reference for additional UBU concerts (D-189/D-197 definition specs, D-185: single active DB event)
    const extraConcerts = [
      {
        id: 'event-ubu-acoustic-2026',
        title: 'UBU Acoustic Night 2026',
        description: 'คอนเสิร์ตโฟล์ก-อะคูสติก ใต้แสงดาวริมสระ ม.อุบลฯ รวมวงดนตรีอะคูสติกและศิลปินอินดี้ เพลิดเพลินกับบทเพลงฟังสบาย บรรยากาศสุดอบอุ่น พิเศษชาว ม.อุบลฯ รับส่วนลดพิเศษเมื่อใช้อีเมลสถาบัน',
        location: 'ลานอเนกประสงค์ ริมสระ มหาวิทยาลัยอุบลราชธานี',
        posterUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
        coverBannerUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80',
        daysOffset: 21,
        durationHours: 5,
        status: 'approved',
        ticketTypes: [
          { id: 'tt-ubu-acoustic-early', name: 'Early Bird บัตรเข้างาน', price: 120, quota: 1500, desc: 'บัตรราคาพิเศษช่วง Early Bird เข้าชมการแสดงโซนทั่วไป' },
          { id: 'tt-ubu-acoustic-reg', name: 'Regular บัตรเข้างาน', price: 180, quota: 2500, desc: 'บัตรเข้าชมการแสดงราคาปกติ โซนทั่วไป' },
        ],
      },
      {
        id: 'event-ubu-isan-indy-2026',
        title: 'Isan Indy Rock Fest 2026',
        description: 'เทศกาลดนตรีร็อกอินดี้อีสาน รวมพลคนดนตรีรุ่นใหม่และวงร็อกระดับแนวหน้า ระเบิดพลังเสียงดนตรีสดสุดมันส์บนเวทีใหญ่ จัดเต็มแสง สี เสียง ตลอดค่ำคืน',
        location: 'ศูนย์การประชุมและแสดงนิทรรศการ มหาวิทยาลัยอุบลราชธานี',
        posterUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=1200&q=80',
        coverBannerUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1600&q=80',
        daysOffset: 35,
        durationHours: 6,
        status: 'pending_approval',
        ticketTypes: [
          { id: 'tt-ubu-isan-indy-zone-a', name: 'บัตร Regular Zone A (หน้าเวที)', price: 250, quota: 3000, desc: 'โซนยืนหน้าเวที สัมผัสความมันส์ใกล้ชิดศิลปิน' },
          { id: 'tt-ubu-isan-indy-zone-b', name: 'บัตร Regular Zone B (อัฒจันทร์)', price: 200, quota: 3000, desc: 'โซนนั่งอัฒจันทร์ มองเห็นเวทีชัดเจนมุมกว้าง' },
        ],
      },
      {
        id: 'event-ubu-countdown-2026',
        title: 'UBU Campus Music Countdown 2026',
        description: 'มหกรรมดนตรีเคานต์ดาวน์ต้อนรับปีใหม่ มหาวิทยาลัยอุบลราชธานี สนุกสนานไปกับการแสดงดนตรีหลากหลายสไตล์ และการนับถอยหลังส่งท้ายปีเก่าต้อนรับปีใหม่ไปด้วยกัน',
        location: 'ลานกิจกรรม อาคารเฉลิมพระเกียรติ 7 รอบฯ มหาวิทยาลัยอุบลราชธานี',
        posterUrl: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80',
        coverBannerUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1600&q=80',
        daysOffset: 50,
        durationHours: 7,
        status: 'draft',
        ticketTypes: [
          { id: 'tt-ubu-countdown-ga', name: 'บัตรเข้างาน Countdown 2026', price: 199, quota: 5000, desc: 'บัตรเข้าชมงานมหกรรมดนตรีเคานต์ดาวน์ปีใหม่และกิจกรรมพิเศษ' },
        ],
      },
    ];
    // In compliance with D-185: do not seed additional mock concerts into live/local database.
    void extraConcerts;
  } catch {
    // Non-blocking in isolated unit tests
  }
}

/**
 * Reverts a pending_approval event and its sessions back to draft (D-200 Item 2)
 */
export async function revertEventToDraft(
  pool: Pool,
  eventId: string,
  organizerId: string,
): Promise<{ success: boolean; eventId: string }> {
  const evRes = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM events WHERE id = $1 AND "organizerId" = $2`,
    [eventId, organizerId],
  );
  if (evRes.rows.length === 0) {
    throw new Error('ไม่พบงานคอนเสิร์ตหรือไม่มีสิทธิ์ดำเนินการ');
  }
  const currentStatus = evRes.rows[0].status;
  if (currentStatus !== 'pending_approval' && currentStatus !== 'submitted') {
    throw new Error('สามารถดึงกลับเป็นฉบับร่างได้เฉพาะงานที่อยู่ในสถานะรออนุมัติเท่านั้น');
  }

  await pool.query(
    `UPDATE events SET status = 'draft', "updatedAt" = now() WHERE id = $1`,
    [eventId],
  );
  await pool.query(
    `UPDATE event_sessions SET status = 'draft', "updatedAt" = now() WHERE "eventId" = $1 AND status IN ('pending_approval', 'submitted')`,
    [eventId],
  );

  return { success: true, eventId };
}

/**
 * Deletes an event draft or pending approval event that has not been approved or sold (D-200 Item 3)
 */
export async function deleteEventDraft(
  pool: Pool,
  eventId: string,
  organizerId: string,
): Promise<{ success: boolean; eventId: string }> {
  const evRes = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM events WHERE id = $1 AND "organizerId" = $2`,
    [eventId, organizerId],
  );
  if (evRes.rows.length === 0) {
    throw new Error('ไม่พบงานคอนเสิร์ตหรือไม่มีสิทธิ์ดำเนินการ');
  }
  const currentStatus = evRes.rows[0].status;
  if (currentStatus !== 'draft' && currentStatus !== 'pending_approval' && currentStatus !== 'submitted') {
    throw new Error('สามารถลบได้เฉพาะงานคอนเสิร์ตในสถานะฉบับร่างหรือรออนุมัติเท่านั้น');
  }

  // Double-check no orders or tickets exist for this event
  const orderCheck = await pool.query(
    `SELECT id FROM orders WHERE "eventId" = $1 LIMIT 1`,
    [eventId],
  );
  if (orderCheck.rows.length > 0) {
    throw new Error('ไม่สามารถลบงานคอนเสิร์ตที่มีประวัติคำสั่งซื้อได้');
  }

  await pool.query(
    `DELETE FROM events WHERE id = $1 AND "organizerId" = $2`,
    [eventId, organizerId],
  );

  return { success: true, eventId };
}

