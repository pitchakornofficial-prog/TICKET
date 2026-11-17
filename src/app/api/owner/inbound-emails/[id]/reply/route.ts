import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { replyToInboundEmail } from '@/server/inbound-email';
import { assertSameOrigin } from '@/server/origin';
import { readBoundedJson } from '@/server/upload-quota';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  let body: { bodyText?: string; subject?: string };
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as { bodyText?: string; subject?: string };
  } catch (error) {
    const status = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return Response.json({ message: 'ข้อมูลตอบกลับไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' }, { status });
  }

  if (!body.bodyText?.trim()) {
    return Response.json({ message: 'กรุณาระบุข้อความตอบกลับ' }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const result = await replyToInboundEmail(getDatabasePool(), {
      inboundEmailId: id,
      bodyText: body.bodyText,
      subject: body.subject,
      sentByUserId: session.user.id,
      sentByEmail: session.user.email,
    });

    return Response.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    });
  } catch (error) {
    return createSafeErrorResponse(error, 'ไม่สามารถส่งอีเมลตอบกลับได้', {
      defaultStatus: 500,
    });
  }
}
