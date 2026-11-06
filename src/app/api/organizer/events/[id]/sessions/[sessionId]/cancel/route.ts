import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { submitSessionCancellation } from '@/server/events';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  try {
    const { id: eventId, sessionId } = await params;
    let actor = await readActor(getAuth(), request.headers);
    if (!actor) {
      try {
        actor = await readActor(getAuth(), await headers());
      } catch {
        // Fallback
      }
    }

    if (actor?.role !== 'organizer') {
      return Response.json(
        { message: 'เฉพาะผู้จัดงาน (Organizer) เท่านั้นที่สามารถยื่นขอยกเลิกรอบการแสดงได้' },
        { status: 403 },
      );
    }

    const pool = getDatabasePool();
    const sessRes = await pool.query<{ eventId: string; organizerId: string }>(
      `SELECT s."eventId", e."organizerId"
       FROM event_sessions s
       JOIN events e ON e.id = s."eventId"
       WHERE s.id = $1`,
      [sessionId],
    );

    if (sessRes.rowCount === 0) {
      return Response.json({ message: 'ไม่พบข้อมูลรอบการแสดงที่ระบุ' }, { status: 404 });
    }

    const sessionData = sessRes.rows[0];
    if (sessionData.eventId !== eventId) {
      return Response.json(
        { message: 'รอบการแสดงนี้ไม่ได้อยู่ภายใต้คอนเสิร์ตที่ระบุใน URL' },
        { status: 400 },
      );
    }

    if (sessionData.organizerId !== actor.id) {
      return Response.json(
        { message: 'Forbidden: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (!body.reason?.trim()) {
      return Response.json(
        { message: 'กรุณาระบุเหตุผลในการขอยกเลิกรอบการแสดง' },
        { status: 400 },
      );
    }

    const result = await submitSessionCancellation(pool, {
      sessionId,
      organizerId: actor.id,
      reason: body.reason.trim(),
    });

    return Response.json(result, { status: 201 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการยื่นขอยกเลิกรอบการแสดง', { defaultStatus: 400 });
  }
}
