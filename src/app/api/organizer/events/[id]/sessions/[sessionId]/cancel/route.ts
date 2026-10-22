import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { submitSessionCancellation } from '@/server/events';

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
        { message: 'เฉพาะผู้จัดงาน (Organizer) เท่านั้นที่สามารถยื่นขอยกเลิกรอบการแสดงได้' },
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

    const result = await submitSessionCancellation(getDatabasePool(), {
      sessionId,
      organizerId: actor.id,
      reason: body.reason.trim(),
    });

    return Response.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการยื่นขอยกเลิกรอบการแสดง';
    return Response.json({ message }, { status: 400 });
  }
}
