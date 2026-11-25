import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface PublicNewsSummary {
  id: string;
  title: string;
  snippet: string;
  coverUrl: string | null;
  publishedAt: string;
  createdAt: string;
}

export interface PublicNewsDetail {
  id: string;
  title: string;
  content: string;
  coverUrl: string | null;
  publishedAt: string;
  createdAt: string;
  authorName: string;
}

export interface OwnerNewsItem {
  id: string;
  title: string;
  content: string;
  summary?: string | null;
  category?: string | null;
  relatedConcert?: string | null;
  relatedEventId?: string | null;
  status: 'draft' | 'pending' | 'published' | 'rejected';
  coverUrl: string | null;
  rejectionReason?: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  authorName: string;
  authorRole?: string | null;
}

export interface OrganizerNewsItem {
  id: string;
  title: string;
  content: string;
  summary: string;
  category: string;
  relatedConcert?: string;
  relatedEventId?: string;
  status: 'draft' | 'pending' | 'published' | 'rejected';
  coverUrl?: string;
  rejectionReason?: string;
  updatedAt: string;
  createdAt: string;
  authorId: string;
  authorName?: string;
}

const newsSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureNewsSchema(pool: Pool): Promise<void> {
  const existing = newsSchemaPromises.get(pool);
  if (existing) return existing;
  const promise = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS news (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          "coverUrl" TEXT,
          "publishedAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "authorId" TEXT NOT NULL REFERENCES auth_user(id)
        );
        ALTER TABLE news ADD COLUMN IF NOT EXISTS summary TEXT;
        ALTER TABLE news ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'ประชาสัมพันธ์คอนเสิร์ต';
        ALTER TABLE news ADD COLUMN IF NOT EXISTS "relatedEventId" TEXT;
        ALTER TABLE news ADD COLUMN IF NOT EXISTS "relatedConcert" TEXT;
        ALTER TABLE news ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
        ALTER TABLE news ADD COLUMN IF NOT EXISTS "authorRole" TEXT DEFAULT 'owner';
        CREATE INDEX IF NOT EXISTS idx_news_status_published_at ON news(status, "publishedAt" DESC);
        CREATE INDEX IF NOT EXISTS idx_news_author_id ON news("authorId");
      `);
    } catch (error) {
      const err = error as { code?: string };
      if (err?.code === '42P01') {
        newsSchemaPromises.delete(pool);
        return;
      }
      if (err?.code === '23505') {
        return;
      }
      newsSchemaPromises.delete(pool);
      throw error;
    }
  })();
  newsSchemaPromises.set(pool, promise);
  return promise;
}

export async function listPublishedNews(pool: Pool): Promise<PublicNewsSummary[]> {
  try {
    await ensureNewsSchema(pool);
    const result = await pool.query<{
      id: string;
      title: string;
      content: string;
      coverUrl: string | null;
      publishedAt: string;
      createdAt: string;
    }>(`
      SELECT
        id,
        title,
        LEFT(content, 201) AS content,
        "coverUrl",
        "publishedAt",
        "createdAt"
      FROM news
      WHERE status = 'published'
      ORDER BY "publishedAt" DESC, "createdAt" DESC
    `);

    return result.rows.map(row => {
      const snippet = row.content.length > 200 ? `${row.content.slice(0, 197)}...` : row.content;
      return {
        id: row.id,
        title: row.title,
        snippet,
        coverUrl: row.coverUrl,
        publishedAt: new Date(row.publishedAt).toISOString(),
        createdAt: new Date(row.createdAt).toISOString(),
      };
    });
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === '42P01') {
      return [];
    }
    throw error;
  }
}

export async function getPublishedNewsById(pool: Pool, id: string): Promise<PublicNewsDetail | null> {
  try {
    await ensureNewsSchema(pool);
    const result = await pool.query<{
      id: string;
      title: string;
      content: string;
      coverUrl: string | null;
      publishedAt: string;
      createdAt: string;
      authorName: string;
    }>(
      `
      SELECT
        n.id,
        n.title,
        n.content,
        n."coverUrl",
        n."publishedAt",
        n."createdAt",
        u.name AS "authorName"
      FROM news n
      JOIN auth_user u ON n."authorId" = u.id
      WHERE n.id = $1 AND n.status = 'published'
    `,
      [id]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      coverUrl: row.coverUrl,
      publishedAt: new Date(row.publishedAt).toISOString(),
      createdAt: new Date(row.createdAt).toISOString(),
      authorName: row.authorName,
    };
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === '42P01') {
      return null;
    }
    throw error;
  }
}

export async function listOwnerNews(pool: Pool): Promise<OwnerNewsItem[]> {
  await ensureNewsSchema(pool);
  const result = await pool.query<{
    id: string;
    title: string;
    content: string;
    summary: string | null;
    category: string | null;
    relatedConcert: string | null;
    relatedEventId: string | null;
    status: 'draft' | 'pending' | 'published' | 'rejected';
    coverUrl: string | null;
    rejectionReason: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    authorId: string;
    authorName: string;
    authorRole: string | null;
  }>(`
    SELECT
      n.id,
      n.title,
      n.content,
      n.summary,
      n.category,
      n."relatedConcert",
      n."relatedEventId",
      n.status,
      n."coverUrl",
      n."rejectionReason",
      n."publishedAt",
      n."createdAt",
      n."updatedAt",
      n."authorId",
      n."authorRole",
      u.name AS "authorName"
    FROM news n
    JOIN auth_user u ON n."authorId" = u.id
    ORDER BY n."createdAt" DESC
  `);

  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary,
    category: row.category,
    relatedConcert: row.relatedConcert,
    relatedEventId: row.relatedEventId,
    status: row.status,
    coverUrl: row.coverUrl,
    rejectionReason: row.rejectionReason,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    authorId: row.authorId,
    authorName: row.authorName,
    authorRole: row.authorRole,
  }));
}

export async function listOrganizerNews(pool: Pool, organizerId: string): Promise<OrganizerNewsItem[]> {
  await ensureNewsSchema(pool);
  const result = await pool.query<{
    id: string;
    title: string;
    content: string;
    summary: string | null;
    category: string | null;
    relatedConcert: string | null;
    relatedEventId: string | null;
    status: 'draft' | 'pending' | 'published' | 'rejected';
    coverUrl: string | null;
    rejectionReason: string | null;
    createdAt: string;
    updatedAt: string;
    authorId: string;
    authorName: string;
  }>(`
    SELECT
      n.id,
      n.title,
      n.content,
      n.summary,
      n.category,
      n."relatedConcert",
      n."relatedEventId",
      n.status,
      n."coverUrl",
      n."rejectionReason",
      n."createdAt",
      n."updatedAt",
      n."authorId",
      u.name AS "authorName"
    FROM news n
    JOIN auth_user u ON n."authorId" = u.id
    WHERE n."authorId" = $1
    ORDER BY n."createdAt" DESC
  `, [organizerId]);

  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary || (row.content.length > 120 ? `${row.content.substring(0, 120)}...` : row.content),
    category: row.category || 'ประชาสัมพันธ์คอนเสิร์ต',
    relatedConcert: row.relatedConcert || undefined,
    relatedEventId: row.relatedEventId || undefined,
    status: row.status,
    coverUrl: row.coverUrl || undefined,
    rejectionReason: row.rejectionReason || undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    authorId: row.authorId,
    authorName: row.authorName,
  }));
}

export async function createOrganizerNews(
  pool: Pool,
  input: {
    title: string;
    content: string;
    summary?: string;
    category?: string;
    relatedConcert?: string;
    relatedEventId?: string;
    coverUrl?: string;
    status: 'draft' | 'pending';
    authorId: string;
  }
): Promise<OrganizerNewsItem> {
  await ensureNewsSchema(pool);
  const id = `news_${randomUUID()}`;
  const status = input.status || 'draft';
  const summary = input.summary || (input.content.length > 120 ? `${input.content.substring(0, 120)}...` : input.content);
  const category = input.category || 'ประชาสัมพันธ์คอนเสิร์ต';

  const result = await pool.query<{
    id: string;
    title: string;
    content: string;
    summary: string | null;
    category: string | null;
    relatedConcert: string | null;
    relatedEventId: string | null;
    status: 'draft' | 'pending' | 'published' | 'rejected';
    coverUrl: string | null;
    rejectionReason: string | null;
    createdAt: string;
    updatedAt: string;
    authorId: string;
  }>(`
    INSERT INTO news (
      id, title, content, summary, category, "relatedConcert", "relatedEventId",
      status, "coverUrl", "authorId", "authorRole", "createdAt", "updatedAt"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'organizer', NOW(), NOW())
    RETURNING id, title, content, summary, category, "relatedConcert", "relatedEventId", status, "coverUrl", "rejectionReason", "createdAt", "updatedAt", "authorId"
  `, [
    id,
    input.title.trim(),
    input.content.trim(),
    summary,
    category,
    input.relatedConcert || null,
    input.relatedEventId || null,
    status,
    input.coverUrl || null,
    input.authorId,
  ]);

  const row = result.rows[0];
  const userRes = await pool.query<{ name: string }>('SELECT name FROM auth_user WHERE id = $1', [row.authorId]);
  const authorName = userRes.rows[0]?.name || 'ผู้จัดงาน';

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary || summary,
    category: row.category || category,
    relatedConcert: row.relatedConcert || undefined,
    relatedEventId: row.relatedEventId || undefined,
    status: row.status,
    coverUrl: row.coverUrl || undefined,
    rejectionReason: row.rejectionReason || undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    authorId: row.authorId,
    authorName,
  };
}

export async function updateOrganizerNews(
  pool: Pool,
  id: string,
  organizerId: string,
  input: {
    title?: string;
    content?: string;
    summary?: string;
    category?: string;
    relatedConcert?: string;
    relatedEventId?: string;
    coverUrl?: string | null;
    status?: 'draft' | 'pending';
  }
): Promise<OrganizerNewsItem | null> {
  await ensureNewsSchema(pool);

  // Check ownership
  const check = await pool.query('SELECT id, status, "authorId" FROM news WHERE id = $1', [id]);
  if (check.rowCount === 0) return null;
  const existing = check.rows[0];
  if (existing.authorId !== organizerId) {
    throw new Error('ไม่อนุญาต: คุณไม่ใช่เจ้าของข่าวสารนี้');
  }

  const updates: string[] = ['"updatedAt" = NOW()'];
  const values: unknown[] = [id];
  let paramIdx = 2;

  if (typeof input.title === 'string') {
    updates.push(`title = $${paramIdx++}`);
    values.push(input.title.trim());
  }
  if (typeof input.content === 'string') {
    updates.push(`content = $${paramIdx++}`);
    values.push(input.content.trim());
    if (!input.summary) {
      updates.push(`summary = $${paramIdx++}`);
      values.push(input.content.trim().length > 120 ? `${input.content.trim().substring(0, 120)}...` : input.content.trim());
    }
  }
  if (typeof input.summary === 'string') {
    updates.push(`summary = $${paramIdx++}`);
    values.push(input.summary.trim());
  }
  if (typeof input.category === 'string') {
    updates.push(`category = $${paramIdx++}`);
    values.push(input.category.trim());
  }
  if (input.relatedConcert !== undefined) {
    updates.push(`"relatedConcert" = $${paramIdx++}`);
    values.push(input.relatedConcert || null);
  }
  if (input.relatedEventId !== undefined) {
    updates.push(`"relatedEventId" = $${paramIdx++}`);
    values.push(input.relatedEventId || null);
  }
  if (input.coverUrl !== undefined) {
    updates.push(`"coverUrl" = $${paramIdx++}`);
    values.push(input.coverUrl);
  }
  if (input.status) {
    updates.push(`status = $${paramIdx++}`);
    values.push(input.status);
    if (input.status === 'pending') {
      // Clear rejection reason on resubmission
      updates.push('"rejectionReason" = NULL');
    }
  }

  const query = `
    UPDATE news
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id, title, content, summary, category, "relatedConcert", "relatedEventId", status, "coverUrl", "rejectionReason", "createdAt", "updatedAt", "authorId"
  `;

  const result = await pool.query(query, values);
  const row = result.rows[0];
  if (!row) return null;

  const userRes = await pool.query<{ name: string }>('SELECT name FROM auth_user WHERE id = $1', [row.authorId]);
  const authorName = userRes.rows[0]?.name || 'ผู้จัดงาน';

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary || '',
    category: row.category || 'ประชาสัมพันธ์คอนเสิร์ต',
    relatedConcert: row.relatedConcert || undefined,
    relatedEventId: row.relatedEventId || undefined,
    status: row.status,
    coverUrl: row.coverUrl || undefined,
    rejectionReason: row.rejectionReason || undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    authorId: row.authorId,
    authorName,
  };
}

export async function deleteOrganizerNews(pool: Pool, id: string, organizerId: string): Promise<boolean> {
  await ensureNewsSchema(pool);
  const check = await pool.query('SELECT id, status, "authorId" FROM news WHERE id = $1', [id]);
  if (check.rowCount === 0) return false;
  const existing = check.rows[0];
  if (existing.authorId !== organizerId) {
    throw new Error('ไม่อนุญาต: คุณไม่ใช่เจ้าของข่าวสารนี้');
  }
  if (existing.status === 'published') {
    throw new Error('ไม่อนุญาต: ไม่สามารถลบข่าวสารที่เผยแพร่แล้วได้ กรุณาติดต่อผู้ดูแลระบบ');
  }

  const result = await pool.query('DELETE FROM news WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function approveNewsItem(pool: Pool, id: string): Promise<OwnerNewsItem | null> {
  await ensureNewsSchema(pool);
  const result = await pool.query<{
    id: string;
    title: string;
    content: string;
    summary: string | null;
    category: string | null;
    relatedConcert: string | null;
    relatedEventId: string | null;
    status: 'draft' | 'pending' | 'published' | 'rejected';
    coverUrl: string | null;
    rejectionReason: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    authorId: string;
  }>(`
    UPDATE news
    SET status = 'published', "publishedAt" = COALESCE("publishedAt", NOW()), "updatedAt" = NOW(), "rejectionReason" = NULL
    WHERE id = $1
    RETURNING id, title, content, summary, category, "relatedConcert", "relatedEventId", status, "coverUrl", "rejectionReason", "publishedAt", "createdAt", "updatedAt", "authorId"
  `, [id]);

  const row = result.rows[0];
  if (!row) return null;

  const userRes = await pool.query<{ name: string }>('SELECT name FROM auth_user WHERE id = $1', [row.authorId]);
  const authorName = userRes.rows[0]?.name || 'ทีมงาน TICKET';

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary,
    category: row.category,
    relatedConcert: row.relatedConcert,
    relatedEventId: row.relatedEventId,
    status: row.status,
    coverUrl: row.coverUrl,
    rejectionReason: row.rejectionReason,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    authorId: row.authorId,
    authorName,
  };
}

export async function rejectNewsItem(pool: Pool, id: string, reason: string): Promise<OwnerNewsItem | null> {
  await ensureNewsSchema(pool);
  const result = await pool.query<{
    id: string;
    title: string;
    content: string;
    summary: string | null;
    category: string | null;
    relatedConcert: string | null;
    relatedEventId: string | null;
    status: 'draft' | 'pending' | 'published' | 'rejected';
    coverUrl: string | null;
    rejectionReason: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    authorId: string;
  }>(`
    UPDATE news
    SET status = 'rejected', "rejectionReason" = $2, "updatedAt" = NOW()
    WHERE id = $1
    RETURNING id, title, content, summary, category, "relatedConcert", "relatedEventId", status, "coverUrl", "rejectionReason", "publishedAt", "createdAt", "updatedAt", "authorId"
  `, [id, reason.trim()]);

  const row = result.rows[0];
  if (!row) return null;

  const userRes = await pool.query<{ name: string }>('SELECT name FROM auth_user WHERE id = $1', [row.authorId]);
  const authorName = userRes.rows[0]?.name || 'ทีมงาน TICKET';

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary,
    category: row.category,
    relatedConcert: row.relatedConcert,
    relatedEventId: row.relatedEventId,
    status: row.status,
    coverUrl: row.coverUrl,
    rejectionReason: row.rejectionReason,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    authorId: row.authorId,
    authorName,
  };
}

export async function createNews(
  pool: Pool,
  input: {
    title: string;
    content: string;
    status?: 'draft' | 'published';
    coverUrl?: string;
    authorId: string;
  }
): Promise<OwnerNewsItem> {
  await ensureNewsSchema(pool);
  const id = `news_${randomUUID()}`;
  const status = input.status || 'draft';
  const publishedAt = status === 'published' ? new Date() : null;

  const result = await pool.query<{
    id: string;
    title: string;
    content: string;
    status: 'draft' | 'published';
    coverUrl: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    authorId: string;
  }>(
    `
    INSERT INTO news (id, title, content, status, "coverUrl", "publishedAt", "authorId")
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, title, content, status, "coverUrl", "publishedAt", "createdAt", "updatedAt", "authorId"
  `,
    [id, input.title.trim(), input.content.trim(), status, input.coverUrl || null, publishedAt, input.authorId]
  );

  const row = result.rows[0];
  const userRes = await pool.query<{ name: string }>('SELECT name FROM auth_user WHERE id = $1', [row.authorId]);
  const authorName = userRes.rows[0]?.name || 'ทีมงาน TICKET';

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    status: row.status,
    coverUrl: row.coverUrl,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    authorId: row.authorId,
    authorName,
  };
}

export async function publishNews(pool: Pool, id: string): Promise<OwnerNewsItem | null> {
  await ensureNewsSchema(pool);
  const result = await pool.query<{
    id: string;
    title: string;
    content: string;
    status: 'draft' | 'published';
    coverUrl: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    authorId: string;
  }>(
    `
    UPDATE news
    SET status = 'published', "publishedAt" = COALESCE("publishedAt", NOW()), "updatedAt" = NOW()
    WHERE id = $1
    RETURNING id, title, content, status, "coverUrl", "publishedAt", "createdAt", "updatedAt", "authorId"
  `,
    [id]
  );

  const row = result.rows[0];
  if (!row) return null;

  const userRes = await pool.query<{ name: string }>('SELECT name FROM auth_user WHERE id = $1', [row.authorId]);
  const authorName = userRes.rows[0]?.name || 'ทีมงาน TICKET';

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    status: row.status,
    coverUrl: row.coverUrl,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    authorId: row.authorId,
    authorName,
  };
}

export async function deleteNews(pool: Pool, id: string): Promise<boolean> {
  await ensureNewsSchema(pool);
  const result = await pool.query('DELETE FROM news WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
