import type { Pool } from 'pg';
import { getAuth } from '@/server/auth';
import { assertSameOrigin } from '@/server/origin';
import { createSafeErrorResponse } from '@/server/api-error';
import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import {
  adminOverrideConcertFull,
  type AdminOverrideConcertInput,
} from '@/server/events';

export const runtime = 'nodejs';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id } = await params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (session?.user.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้ดูแลระบบ (Owner) เท่านั้น' },
      { status: 403 },
    );
  }

  let body: AdminOverrideConcertInput;
  try {
    body = await readBoundedJson<AdminOverrideConcertInput>(request, 128 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return Response.json({ message: 'ข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const updated = await adminOverrideConcertFull(pool, id, session.user.id, body);
    return Response.json(
      {
        success: true,
        message: 'บันทึกการแก้ไขข้อมูลคอนเสิร์ตโดยผู้ดูแลระบบสำเร็จ',
        event: updated,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(
      error,
      'เกิดข้อผิดพลาดในการแก้ไขข้อมูลคอนเสิร์ตโดยผู้ดูแลระบบ',
      { defaultStatus: 400 },
    );
  }
}
