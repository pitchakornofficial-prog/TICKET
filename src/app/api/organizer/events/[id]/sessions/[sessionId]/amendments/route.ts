import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { submitSessionAmendment, listSessionAmendments } from '@/server/events';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
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
        { message: 'เฉพาะผู้จัดงาน (Organizer) เท่านั้นที่สามารถยื่นขอแก้ไขรอบการแสดงได้' },
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
    const ticketTypes = Array.isArray(body.ticketTypes) ? body.ticketTypes : [];

    if (ticketTypes.length === 0) {
      return Response.json(
        { message: 'กรุณาระบุข้อมูลประเภทบัตรอย่างน้อย 1 ประเภท' },
        { status: 400 },
      );
    }

    const result = await submitSessionAmendment(pool, {
      sessionId,
      organizerId: actor.id,
      startTime: body.startTime,
      endTime: body.endTime,
      admissionStartTime: body.admissionStartTime,
      admissionEndTime: body.admissionEndTime,
      ticketTypes,
    });

    return Response.json(
      {
        message: 'ยื่นคำขอแก้ไขรอบการแสดงสำเร็จ รอเจ้าของระบบ (Owner) ตรวจสอบและอนุมัติ (AC-67)',
        amendmentId: result.amendmentId,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการยื่นแก้ไขรอบการแสดง';
    return Response.json({ message }, { status: 400 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
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

    if (!actor || (actor.role !== 'organizer' && actor.role !== 'owner')) {
      return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
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

    if (actor.role === 'organizer' && sessionData.organizerId !== actor.id) {
      return Response.json(
        { message: 'Forbidden: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้' },
        { status: 403 },
      );
    }

    const amendments = await listSessionAmendments(pool, sessionId);
    return Response.json({ amendments }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดรายการแก้ไขรอบ';
    return Response.json({ message }, { status: 500 });
  }
}
