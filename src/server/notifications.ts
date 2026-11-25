import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from './database.ts';

export interface NotificationActor {
  userId: string;
  email: string;
  role: 'owner' | 'organizer' | 'scanner' | string;
}

export interface AdminNotificationRecord {
  id: string;
  userId: string | null;
  role: string | null;
  title: string;
  summary: string;
  content: string;
  category: 'finance' | 'concert' | 'staff' | 'system';
  referenceId: string | null;
  isRead: boolean;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
  timeAgo?: string;
  formattedDate?: string;
}

export interface CreateNotificationInput {
  userId?: string | null;
  role?: 'owner' | 'organizer' | 'scanner' | string | null;
  title: string;
  summary: string;
  content?: string;
  category?: 'finance' | 'concert' | 'staff' | 'system';
  referenceId?: string | null;
  createdAt?: Date;
}

const thDateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTimeAgo(dateInput: Date | string, now = new Date()): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'เมื่อสักครู่';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'เมื่อสักครู่';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'เมื่อวานนี้';
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;

  return thDateTimeFormatter.format(date);
}

const notificationSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureNotificationSchema(pool: Pool): Promise<void> {
  const existing = notificationSchemaPromises.get(pool);
  if (existing) return existing;

  const promise = (async () => {
    await inTransaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [945162037]);
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_notifications (
          id TEXT PRIMARY KEY,
          "userId" TEXT,
          role TEXT,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'system',
          "referenceId" TEXT,
          "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
          "isSaved" BOOLEAN NOT NULL DEFAULT FALSE,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON admin_notifications("userId", "createdAt" DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_role_created ON admin_notifications(role, "createdAt" DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_unread ON admin_notifications("userId", "isRead") WHERE "isRead" = FALSE;
      `);
    });
  })().catch((err) => {
    notificationSchemaPromises.delete(pool);
    throw err;
  });

  notificationSchemaPromises.set(pool, promise);
  await promise;
}

export async function createNotification(
  clientOrPool: Pool | PoolClient,
  input: CreateNotificationInput,
): Promise<AdminNotificationRecord> {
  const id = `NTF-${randomUUID().slice(0, 8).toUpperCase()}`;
  const now = input.createdAt || new Date();
  const content = input.content || input.summary;
  const category = input.category || 'system';

  const res = await clientOrPool.query<AdminNotificationRecord>(
    `INSERT INTO admin_notifications (
       id, "userId", role, title, summary, content, category, "referenceId", "isRead", "isSaved", "createdAt", "updatedAt"
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, FALSE, $9, $9)
     RETURNING *`,
    [
      id,
      input.userId || null,
      input.role || null,
      input.title,
      input.summary,
      content,
      category,
      input.referenceId || null,
      now,
    ],
  );

  return res.rows[0];
}

export async function listNotificationsForActor(
  pool: Pool,
  actor: NotificationActor,
  options?: {
    tab?: 'all' | 'unread' | 'saved';
    limit?: number;
    now?: Date;
  },
): Promise<{
  notifications: AdminNotificationRecord[];
  unreadCount: number;
  savedCount: number;
  totalCount: number;
}> {
  await ensureNotificationSchema(pool);
  const now = options?.now || new Date();
  const limit = options?.limit || 50;

  // An actor can see notifications explicitly directed to their userId OR to their role
  const userId = actor.userId;
  const role = actor.role;

  // 1. Fetch counts
  const countRes = await pool.query<{
    totalCount: string;
    unreadCount: string;
    savedCount: string;
  }>(
    `SELECT
       COUNT(*)::text as "totalCount",
       COUNT(*) FILTER (WHERE "isRead" = FALSE)::text as "unreadCount",
       COUNT(*) FILTER (WHERE "isSaved" = TRUE)::text as "savedCount"
     FROM admin_notifications
     WHERE ("userId" = $1 OR ("userId" IS NULL AND (role = $2 OR role = 'all' OR role IS NULL)))`,
    [userId, role],
  );

  const totalCount = Number(countRes.rows[0]?.totalCount || 0);
  const unreadCount = Number(countRes.rows[0]?.unreadCount || 0);
  const savedCount = Number(countRes.rows[0]?.savedCount || 0);

  // 2. Fetch notifications according to tab
  let filterClause = '';
  if (options?.tab === 'unread') {
    filterClause = 'AND "isRead" = FALSE';
  } else if (options?.tab === 'saved') {
    filterClause = 'AND "isSaved" = TRUE';
  }

  const listRes = await pool.query<AdminNotificationRecord>(
    `SELECT *
     FROM admin_notifications
     WHERE ("userId" = $1 OR ("userId" IS NULL AND (role = $2 OR role = 'all' OR role IS NULL)))
       ${filterClause}
     ORDER BY "createdAt" DESC
     LIMIT $3`,
    [userId, role, limit],
  );

  const notifications = listRes.rows.map((row) => {
    const createdAtDate = new Date(row.createdAt);
    return {
      ...row,
      timeAgo: formatTimeAgo(createdAtDate, now),
      formattedDate: thDateTimeFormatter.format(createdAtDate),
    };
  });

  return {
    notifications,
    unreadCount,
    savedCount,
    totalCount,
  };
}

export async function markNotificationRead(
  pool: Pool,
  actor: NotificationActor,
  id: string,
  isRead = true,
): Promise<boolean> {
  await ensureNotificationSchema(pool);
  const res = await pool.query(
    `UPDATE admin_notifications
     SET "isRead" = $1, "updatedAt" = now()
     WHERE id = $2
       AND ("userId" = $3 OR ("userId" IS NULL AND (role = $4 OR role = 'all' OR role IS NULL)))`,
    [isRead, id, actor.userId, actor.role],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function markAllNotificationsRead(
  pool: Pool,
  actor: NotificationActor,
): Promise<number> {
  await ensureNotificationSchema(pool);
  const res = await pool.query(
    `UPDATE admin_notifications
     SET "isRead" = TRUE, "updatedAt" = now()
     WHERE ("userId" = $1 OR ("userId" IS NULL AND (role = $2 OR role = 'all' OR role IS NULL)))
       AND "isRead" = FALSE`,
    [actor.userId, actor.role],
  );
  return res.rowCount ?? 0;
}

export async function toggleNotificationSaved(
  pool: Pool,
  actor: NotificationActor,
  id: string,
  isSaved?: boolean,
): Promise<boolean> {
  await ensureNotificationSchema(pool);
  let res: { rowCount: number | null };
  if (isSaved !== undefined) {
    res = await pool.query(
      `UPDATE admin_notifications
       SET "isSaved" = $1, "updatedAt" = now()
       WHERE id = $2
         AND ("userId" = $3 OR ("userId" IS NULL AND (role = $4 OR role = 'all' OR role IS NULL)))`,
      [isSaved, id, actor.userId, actor.role],
    );
  } else {
    res = await pool.query(
      `UPDATE admin_notifications
       SET "isSaved" = NOT "isSaved", "updatedAt" = now()
       WHERE id = $1
         AND ("userId" = $2 OR ("userId" IS NULL AND (role = $3 OR role = 'all' OR role IS NULL)))`,
      [id, actor.userId, actor.role],
    );
  }
  return (res.rowCount ?? 0) > 0;
}

export async function deleteNotification(
  pool: Pool,
  actor: NotificationActor,
  id: string,
): Promise<boolean> {
  await ensureNotificationSchema(pool);
  const res = await pool.query(
    `DELETE FROM admin_notifications
     WHERE id = $1
       AND ("userId" = $2 OR ("userId" IS NULL AND (role = $3 OR role = 'all' OR role IS NULL)))`,
    [id, actor.userId, actor.role],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Backfill notifications from real database records (e.g. approved sessions, direct tickets)
 * if the notifications table is empty, ensuring new/existing environments have true data immediately.
 */
export async function backfillNotificationsFromRealEvents(pool: Pool): Promise<number> {
  await ensureNotificationSchema(pool);
  const countRes = await pool.query('SELECT COUNT(*)::int as count FROM admin_notifications');
  if (countRes.rows[0].count > 0) return 0;

  let created = 0;

  // 1. Check for real direct ticket orders
  const directOrdersRes = await pool.query(
    `SELECT o.id, o."buyerName", o."buyerEmail", o."createdAt", e.title as "eventTitle",
            COUNT(t.id)::int as "ticketCount"
     FROM orders o
     JOIN events e ON o."eventId" = e.id
     LEFT JOIN tickets t ON t."orderId" = o.id
     WHERE o."orderSource" = 'direct'
     GROUP BY o.id, o."buyerName", o."buyerEmail", o."createdAt", e.title
     ORDER BY o."createdAt" DESC
     LIMIT 5`,
  );

  for (const row of directOrdersRes.rows) {
    await createNotification(pool, {
      role: 'owner',
      category: 'concert',
      title: `ออกบัตรโควตาตรงสำเร็จ: ${row.eventTitle}`,
      summary: `ระบบได้จัดสรรบัตรตรงจำนวน ${row.ticketCount} ใบ ให้แก่ ${row.buyerName} (คำสั่งซื้อ #${row.id})`,
      content: `รายการออกบัตรตรง #${row.id} สำเร็จเรียบร้อย บัตรจำนวน ${row.ticketCount} ใบ ได้รับการบันทึกลงในระบบและส่งมอบเรียบร้อยแล้ว`,
      referenceId: row.id,
      createdAt: new Date(row.createdAt),
    });
    created++;
  }

  // 2. Check for real approved event sessions
  const sessionsRes = await pool.query(
    `SELECT es.id, es."startTime", e.title as "eventTitle", e."organizerId", es."createdAt"
     FROM event_sessions es
     JOIN events e ON es."eventId" = e.id
     WHERE es.status = 'open'
     ORDER BY es."createdAt" DESC
     LIMIT 5`,
  );

  for (const row of sessionsRes.rows) {
    await createNotification(pool, {
      userId: row.organizerId,
      role: 'organizer',
      category: 'concert',
      title: `รอบการแสดงได้รับการอนุมัติ: ${row.eventTitle}`,
      summary: `รอบการแสดงคอนเสิร์ต ${row.eventTitle} ได้รับการอนุมัติและเปิดให้ซื้อบัตรได้ตามกำหนดการ`,
      content: `รอบการแสดง ${row.id} ของงาน ${row.eventTitle} ผ่านการตรวจสอบและพร้อมเปิดจำหน่ายแล้ว`,
      referenceId: row.id,
      createdAt: new Date(row.createdAt),
    });
    created++;
  }

  return created;
}
