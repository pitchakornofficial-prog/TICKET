import { getAuth } from '@/server/auth';
import { listAdmissionSyncConflicts } from '@/server/admission';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return Response.json({ message: 'ไม่อนุญาต: กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  if (session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น (403)' }, { status: 403 });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId') || undefined;

  const pool = auth.options.database as Pool;

  try {
    const conflicts = await listAdmissionSyncConflicts(pool, eventId);
    return Response.json({ conflicts }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงรายการข้อขัดแย้งการซิงก์';
    return Response.json({ message }, { status: 500 });
  }
}
