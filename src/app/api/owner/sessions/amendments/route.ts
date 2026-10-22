import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { listPendingSessionAmendments } from '@/server/events';

export const runtime = 'nodejs';

export async function GET(_request: Request) {
  try {
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'owner') {
      return Response.json(
        { message: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์ดูคำขอแก้ไขรอบ' },
        { status: 403 },
      );
    }

    const pendingAmendments = await listPendingSessionAmendments(getDatabasePool());
    return Response.json({ amendments: pendingAmendments }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดคำขอแก้ไขรอบ';
    return Response.json({ message }, { status: 500 });
  }
}
