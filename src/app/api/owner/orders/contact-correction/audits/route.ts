import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { getAllOrderContactAuditLogs } from '@/server/contact-correction';
import { createSafeErrorResponse } from '@/server/api-error';

export const runtime = 'nodejs';

export async function GET() {
  const actor = await readActor(getAuth(), await headers());
  if (!actor) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  if (actor.role !== 'owner') {
    return Response.json(
      { message: 'ไม่มีสิทธิ์เข้าถึง (เฉพาะผู้ดูแลระบบเท่านั้น)' },
      { status: 403 },
    );
  }

  try {
    const pool = getDatabasePool();
    const audits = await getAllOrderContactAuditLogs(pool, actor);
    return Response.json({ audits }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงประวัติการแก้ไขข้อมูลติดต่อ', { defaultStatus: 500 });
  }
}
