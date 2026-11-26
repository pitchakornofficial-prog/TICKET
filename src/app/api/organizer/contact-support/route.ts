import type { Pool } from 'pg';
import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { readBoundedJson, isPayloadTooLargeError, payloadTooLargeResponse } from '@/server/http-body';
import { createNotification } from '@/server/notifications';
import { assertSameOrigin } from '@/server/origin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || (session.user.role !== 'organizer' && session.user.role !== 'owner')) {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' },
      { status: 403 },
    );
  }

  let body: {
    subject?: string;
    category?: 'finance' | 'concert' | 'staff' | 'system';
    message?: string;
  } = {};

  try {
    body = await readBoundedJson(request, 32 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return Response.json({ message: 'ข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const subject = body.subject?.trim() || '';
  const messageText = body.message?.trim() || '';
  const category =
    body.category && ['finance', 'concert', 'staff', 'system'].includes(body.category)
      ? body.category
      : 'system';

  if (!subject) {
    return Response.json({ message: 'กรุณาระบุหัวข้อเรื่องที่ต้องการติดต่อ' }, { status: 400 });
  }
  if (!messageText) {
    return Response.json({ message: 'กรุณากรอกรายละเอียดข้อความ' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;

  try {
    const senderName = session.user.name?.trim() || 'ผู้จัดงาน';
    const senderEmail = session.user.email?.trim() || '';

    const notification = await createNotification(pool, {
      role: 'owner',
      title: `ข้อความจากผู้จัดงาน: ${subject}`,
      summary: `${senderName}${senderEmail ? ` (${senderEmail})` : ''}: ${
        messageText.length > 140 ? `${messageText.slice(0, 140)}...` : messageText
      }`,
      content: `ผู้ส่ง: ${senderName}${senderEmail ? ` (${senderEmail})` : ''}\nหมวดหมู่: ${category}\n\n${messageText}`,
      category,
      referenceId: `org-contact-${session.user.id}`,
    });

    return Response.json(
      {
        message: 'ส่งข้อความถึงผู้ดูแลระบบเรียบร้อยแล้ว',
        notificationId: notification.id,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งข้อความถึงผู้ดูแลระบบ', {
      defaultStatus: 500,
    });
  }
}
