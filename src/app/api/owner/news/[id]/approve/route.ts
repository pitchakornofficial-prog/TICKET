import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { approveNewsItem } from '@/server/news';
import { createNotification } from '@/server/notifications';
import { safeRevalidateTag } from '@/server/cache';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
    return Response.json({ message: 'News ID is required' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const approved = await approveNewsItem(pool, id);
    if (!approved) {
      return Response.json({ message: 'ไม่พบข่าวสารที่ต้องการอนุมัติ' }, { status: 404 });
    }

    safeRevalidateTag('public-news');

    // Notify author if it was written by an organizer
    if (approved.authorId && approved.authorId !== session.user.id) {
      try {
        await createNotification(pool, {
          userId: approved.authorId,
          role: 'organizer',
          title: 'ข่าวสารของคุณได้รับการอนุมัติและเผยแพร่แล้ว',
          summary: `ข่าวสารหัวข้อ "${approved.title}" ได้รับการอนุมัติและเผยแพร่สู่หน้าเว็บไซต์เรียบร้อยแล้ว`,
          category: 'system',
          referenceId: approved.id,
        });
      } catch (notifErr) {
        console.error('Failed to notify organizer about approved news:', notifErr);
      }
    }

    return Response.json({
      message: 'อนุมัติและเผยแพร่ข่าวสารเรียบร้อยแล้ว',
      newsItem: approved,
    }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการอนุมัติข่าวสาร', { defaultStatus: 500 });
  }
}
