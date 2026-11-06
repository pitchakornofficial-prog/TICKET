import { createSafeErrorResponse } from '@/server/api-error';
import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { listPendingSessionCancellations } from '@/server/events';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'owner') {
      return Response.json(
        { message: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์ดูรายการขอยกเลิกรอบการแสดง' },
        { status: 403 },
      );
    }

    const cancellations = await listPendingSessionCancellations(getDatabasePool());
    return Response.json({ cancellations }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงข้อมูลคำขอยกเลิกรอบการแสดง', { defaultStatus: 400 });
  }
}
