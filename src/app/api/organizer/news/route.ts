import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { listOrganizerNews, createOrganizerNews } from '@/server/news';
import { createNotification } from '@/server/notifications';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || (session.user.role !== 'organizer' && session.user.role !== 'owner')) {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  try {
    const news = await listOrganizerNews(pool, session.user.id);
    return Response.json({ news }, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงข้อมูลข่าวสาร', { defaultStatus: 500 });
  }
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || (session.user.role !== 'organizer' && session.user.role !== 'owner')) {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  let body: {
    title?: string;
    content?: string;
    summary?: string;
    category?: string;
    relatedConcert?: string;
    relatedEventId?: string;
    coverUrl?: string;
    status?: 'draft' | 'pending';
  } = {};

  try {
    body = await readBoundedJson(request, 128 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return Response.json({ message: 'กรุณากรอกหัวข้อข่าว' }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return Response.json({ message: 'กรุณากรอกเนื้อหาข่าว' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const newsItem = await createOrganizerNews(pool, {
      title: body.title,
      content: body.content,
      summary: body.summary,
      category: body.category,
      relatedConcert: body.relatedConcert,
      relatedEventId: body.relatedEventId,
      coverUrl: body.coverUrl,
      status: body.status || 'draft',
      authorId: session.user.id,
    });

    if (newsItem.status === 'pending') {
      try {
        await createNotification(pool, {
          role: 'owner',
          title: 'มีคำขออนุมัติข่าวสารใหม่จากผู้จัดงาน',
          summary: `ผู้จัดงาน ${session.user.name || 'ผู้จัดงาน'} ส่งข่าวสาร "${newsItem.title}" เพื่อรอการตรวจสอบและอนุมัติ`,
          content: `ข่าวสารหัวข้อ "${newsItem.title}" หมวดหมู่ ${newsItem.category} ถูกส่งเข้าสู่ระบบเพื่อรอการเผยแพร่`,
          category: 'system',
          referenceId: newsItem.id,
        });
      } catch (notifErr) {
        console.error('Failed to notify owner about pending news:', notifErr);
      }
    }

    return Response.json({
      message: newsItem.status === 'pending' ? 'ส่งคำขออนุมัติข่าวสารเรียบร้อยแล้ว' : 'บันทึกฉบับร่างเรียบร้อยแล้ว',
      newsItem,
    }, { status: 201 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการบันทึกข่าวสาร', { defaultStatus: 500 });
  }
}
