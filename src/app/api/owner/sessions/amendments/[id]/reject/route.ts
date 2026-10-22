import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { rejectSessionAmendment } from '@/server/events';

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
        { message: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์ปฏิเสธการแก้ไขรอบการแสดง' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const rejectionReason = typeof body.rejectionReason === 'string' ? body.rejectionReason : '';

    const result = await rejectSessionAmendment(getDatabasePool(), {
      amendmentId: id,
      ownerId: actor.id,
      rejectionReason,
    });

    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการปฏิเสธการแก้ไขรอบการแสดง';
    return Response.json({ message }, { status: 400 });
  }
}
