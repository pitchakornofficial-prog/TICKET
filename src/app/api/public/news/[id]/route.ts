import { getDatabasePool } from '@/server/database';
import { getPublishedNewsById } from '@/server/news';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const pool = getDatabasePool();
    const newsItem = await getPublishedNewsById(pool, id);
    if (!newsItem) {
      return Response.json({ message: 'ไม่พบข่าวสารที่เผยแพร่' }, { status: 404 });
    }
    return Response.json({ newsItem }, { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.warn('Unable to get public news detail:', error);
    }
    return Response.json({ message: 'ไม่สามารถดึงข้อมูลข่าวสารได้' }, { status: 500 });
  }
}
