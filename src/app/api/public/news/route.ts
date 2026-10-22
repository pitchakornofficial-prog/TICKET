import { getDatabasePool } from '@/server/database';
import { listPublishedNews } from '@/server/news';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const pool = getDatabasePool();
    const news = await listPublishedNews(pool);
    return Response.json({ news }, { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.warn('Unable to list public news:', error);
    }
    return Response.json({ news: [] }, { status: 200 });
  }
}
