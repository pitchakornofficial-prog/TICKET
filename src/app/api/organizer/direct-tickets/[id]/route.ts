import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getDirectTicketBatchDetail } from '@/server/direct-tickets';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อน (401)' }, { status: 401 });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น (403)' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;

  try {
    const data = await getDirectTicketBatchDetail(
      pool,
      id,
      session.user.role === 'organizer' ? session.user.id : undefined,
    );
    return Response.json(
      { ok: true, batch: data.batch, tickets: data.tickets },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
      },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการโหลดรายละเอียดบัตร', { defaultStatus: 404 });
  }
}
