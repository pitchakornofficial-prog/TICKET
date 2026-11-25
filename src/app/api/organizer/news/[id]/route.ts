import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { updateOrganizerNews, deleteOrganizerNews } from '@/server/news';
import { createNotification } from '@/server/notifications';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || (session.user.role !== 'organizer' && session.user.role !== 'owner')) {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ message: 'News ID is required' }, { status: 400 });
  }

  let body: {
    title?: string;
    content?: string;
    summary?: string;
    category?: string;
    relatedConcert?: string;
    relatedEventId?: string;
    coverUrl?: string | null;
    status?: 'draft' | 'pending';
  } = {};

  try {
    body = await readBoundedJson(request, 128 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const updated = await updateOrganizerNews(pool, id, session.user.id, body);
    if (!updated) {
      return Response.json({ message: 'ไม่พบรายการข่าวสาร' }, { status: 404 });
    }

    if (body.status === 'pending') {
      try {
        await createNotification(pool, {
          role: 'owner',
          title: 'มีการแก้ไขและส่งขออนุมัติข่าวสารใหม่',
          summary: `ผู้จัดงาน ${session.user.name || 'ผู้จัดงาน'} ส่งข่าวสาร "${updated.title}" เพื่อรอการตรวจสอบและอนุมัติ`,
          category: 'system',
          referenceId: updated.id,
        });
      } catch (notifErr) {
        console.error('Failed to notify owner about resubmitted news:', notifErr);
      }
    }

    return Response.json({
      message: body.status === 'pending' ? 'ส่งคำขออนุมัติข่าวสารเรียบร้อยแล้ว' : 'อัปเดตข่าวสารเรียบร้อยแล้ว',
      newsItem: updated,
    }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการอัปเดตข่าวสาร', { defaultStatus: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || (session.user.role !== 'organizer' && session.user.role !== 'owner')) {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ message: 'News ID is required' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const deleted = await deleteOrganizerNews(pool, id, session.user.id);
    if (!deleted) {
      return Response.json({ message: 'ไม่สามารถลบข่าวสารได้ หรือไม่พบรายการ' }, { status: 404 });
    }
    return Response.json({ message: 'ลบข่าวสารเรียบร้อยแล้ว' }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการลบข่าวสาร', { defaultStatus: 500 });
  }
}
