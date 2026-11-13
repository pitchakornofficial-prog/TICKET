import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { safeRevalidateTag } from '@/server/cache';
import { publishNews } from '@/server/news';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ message: 'Missing news id' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const updated = await publishNews(pool, id);
    if (!updated) {
      return Response.json({ message: 'ไม่พบข่าวที่ต้องการเผยแพร่' }, { status: 404 });
    }
    safeRevalidateTag('public-news');
    return Response.json({ message: 'เผยแพร่ข่าวสารสำเร็จ', newsItem: updated }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการเผยแพร่ข่าว', { defaultStatus: 500 });
  }
}
