import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { rejectSessionCancellation } from '@/server/events';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'owner') {
      return Response.json(
        { message: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์ปฏิเสธการยกเลิกรอบการแสดง' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (!body.rejectionReason?.trim()) {
      return Response.json(
        { message: 'กรุณาระบุเหตุผลในการปฏิเสธคำขอยกเลิกรอบการแสดง' },
        { status: 400 },
      );
    }

    const result = await rejectSessionCancellation(getDatabasePool(), {
      cancellationId: id,
      ownerId: actor.id,
      rejectionReason: body.rejectionReason.trim(),
    });

    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการปฏิเสธการยกเลิกรอบการแสดง';
    return Response.json({ message }, { status: 400 });
  }
}
