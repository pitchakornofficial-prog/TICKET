import type { Pool } from 'pg';
import { getAuth } from '@/server/auth';
import { createSafeErrorResponse } from '@/server/api-error';
import { getEventAuditLogs } from '@/server/event-audit';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (session?.user.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้ดูแลระบบ (Owner) เท่านั้น' },
      { status: 403 },
    );
  }

  const pool = auth.options.database as Pool;
  try {
    const logs = await getEventAuditLogs(pool, id);
    return Response.json(
      { logs },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
      },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(
      error,
      'เกิดข้อผิดพลาดในการโหลดประวัติการแก้ไขคอนเสิร์ต',
      { defaultStatus: 500 },
    );
  }
}
