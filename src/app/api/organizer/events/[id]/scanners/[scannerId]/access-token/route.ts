import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { ensureEventSchema } from '@/server/events';
import {
  issueScannerAccessTokenForOrganizer,
  revokeScannerAccessTokens,
} from '@/server/scanner-access';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; scannerId: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น' },
      { status: 403 },
    );
  }

  const { id: eventId, scannerId } = await params;
  const pool = auth.options.database as Pool;

  try {
    await ensureEventSchema(pool);
    const issued = await issueScannerAccessTokenForOrganizer(
      pool,
      session.user.id,
      eventId,
      scannerId,
    );
    return Response.json(
      {
        message: 'ออกลิงก์เข้าใช้งานแบบใช้ครั้งเดียวเรียบร้อยแล้ว (ลิงก์เดิมถูกยกเลิกแล้ว)',
        accessUrl: issued.accessUrl,
        expiresAt: issued.expiresAt,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการออกลิงก์เข้าใช้งานทีมสแกน', {
      defaultStatus: 400,
      statusResolver: (msg) => (msg.includes('ไม่มีสิทธิ์') ? 403 : 400),
    });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; scannerId: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น' },
      { status: 403 },
    );
  }

  const { id: eventId, scannerId } = await params;
  const pool = auth.options.database as Pool;

  try {
    await ensureEventSchema(pool);
    const evRes = await pool.query<{ organizerId: string }>(
      'SELECT "organizerId" FROM events WHERE id = $1',
      [eventId],
    );
    if (evRes.rowCount === 0) {
      return Response.json({ message: 'ไม่พบงานคอนเสิร์ต' }, { status: 404 });
    }
    if (evRes.rows[0].organizerId !== session.user.id) {
      return Response.json(
        { message: 'คุณไม่มีสิทธิ์จัดการทีมสแกนของงานนี้' },
        { status: 403 },
      );
    }

    const revokedCount = await revokeScannerAccessTokens(pool, eventId, scannerId);
    return Response.json(
      {
        message: 'เพิกถอนลิงก์เข้าใช้งานที่ยังไม่ได้เปิดใช้เรียบร้อยแล้ว',
        revokedCount,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการเพิกถอนลิงก์เข้าใช้งาน', {
      defaultStatus: 400,
      statusResolver: (msg) => (msg.includes('ไม่มีสิทธิ์') ? 403 : 400),
    });
  }
}
