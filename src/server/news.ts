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
  status: 'draft' | 'published';
  coverUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  authorName: string;
}

export async function ensureNewsSchema(pool: Pool): Promise<void> {
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
      CREATE INDEX IF NOT EXISTS idx_news_status_published_at ON news(status, "publishedAt" DESC);
    `);
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === '42P01') {
      // auth_user table does not exist yet (e.g. during early build before migrations)
      return;
    }
    throw error;
  }
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
        content,
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
    status: 'draft' | 'published';
    coverUrl: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    authorId: string;
    authorName: string;
  }>(`
    SELECT
      n.id,
      n.title,
      n.content,
      n.status,
      n."coverUrl",
      n."publishedAt",
      n."createdAt",
      n."updatedAt",
      n."authorId",
      u.name AS "authorName"
    FROM news n
    JOIN auth_user u ON n."authorId" = u.id
    ORDER BY n."createdAt" DESC
  `);

  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    status: row.status,
    coverUrl: row.coverUrl,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    authorId: row.authorId,
    authorName: row.authorName,
  }));
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
