import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { approveSessionCancellation } from '@/server/events';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'owner') {
      return Response.json(
        { message: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์อนุมัติการยกเลิกรอบการแสดง (AC-35)' },
        { status: 403 },
      );
    }

    const result = await approveSessionCancellation(getDatabasePool(), {
      cancellationId: id,
      ownerId: actor.id,
    });

    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการอนุมัติการยกเลิกรอบการแสดง';
    return Response.json({ message }, { status: 400 });
  }
}
