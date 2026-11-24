import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { sendDirectIssuedTicketsEmail } from '@/server/ticket-delivery';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id } = await props.params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น (403)' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;

  try {
    const result = await sendDirectIssuedTicketsEmail(pool, id);
    if (!result.success) {
      return Response.json({ ok: false, error: result.error || 'ส่งอีเมลไม่สำเร็จ' }, { status: 400 });
    }
    return Response.json({ ok: true, messageId: result.messageId }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งอีเมลซ้ำ', { defaultStatus: 500 });
  }
}
