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
    const { sessionId } = await params;
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'organizer') {
      return Response.json(
        { message: 'เฉพาะผู้จัดงาน (Organizer) เท่านั้นที่สามารถยื่นขอแก้ไขรอบการแสดงได้' },
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

    const result = await submitSessionAmendment(getDatabasePool(), {
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
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const actor = await readActor(getAuth(), await headers());

    if (!actor || (actor.role !== 'organizer' && actor.role !== 'owner')) {
      return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
    }

    const amendments = await listSessionAmendments(getDatabasePool(), sessionId);
    return Response.json({ amendments }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดรายการแก้ไขรอบ';
    return Response.json({ message }, { status: 500 });
  }
}
