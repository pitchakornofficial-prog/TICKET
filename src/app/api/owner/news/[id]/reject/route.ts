import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { rejectNewsItem } from '@/server/news';
import { createNotification } from '@/server/notifications';
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

  let body: { reason?: string } = {};
  try {
    body = await readBoundedJson(request, 64 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const reason = (body.reason || '').trim();
  if (!reason) {
    return Response.json({ message: 'กรุณาระบุเหตุผลการส่งกลับแก้ไข' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const rejected = await rejectNewsItem(pool, id, reason);
    if (!rejected) {
      return Response.json({ message: 'ไม่พบข่าวสารที่ต้องการส่งกลับแก้ไข' }, { status: 404 });
    }

    // Notify author if it was written by an organizer
    if (rejected.authorId && rejected.authorId !== session.user.id) {
      try {
        await createNotification(pool, {
          userId: rejected.authorId,
          role: 'organizer',
          title: 'ข่าวสารของคุณถูกส่งกลับเพื่อแก้ไข',
          summary: `ข่าวสาร "${rejected.title}" ไม่ผ่านการอนุมัติ: ${reason}`,
          content: `เหตุผลการส่งกลับแก้ไข: ${reason}`,
          category: 'system',
          referenceId: rejected.id,
        });
      } catch (notifErr) {
        console.error('Failed to notify organizer about rejected news:', notifErr);
      }
    }

    return Response.json({
      message: 'ส่งกลับแก้ไขข่าวสารเรียบร้อยแล้ว',
      newsItem: rejected,
    }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งกลับแก้ไขข่าวสาร', { defaultStatus: 500 });
  }
}
