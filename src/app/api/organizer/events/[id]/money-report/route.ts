import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getEventMoneyReport } from '@/server/reports';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json(
      { message: 'กรุณาเข้าสู่ระบบก่อนเข้าถึงรายงานการเงิน' },
      { status: 401 },
    );
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้นที่เข้าถึงรายงานการเงินได้' },
      { status: 403 },
    );
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const report = await getEventMoneyReport(pool, eventId, {
      id: session.user.id,
      role: session.user.role as 'organizer' | 'owner',
    });

    return Response.json({ report }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงรายงานการเงิน', {
      defaultStatus: 500,
      statusResolver: (msg) => msg.includes('ไม่อนุญาต') ? 403 : msg.includes('ไม่พบ') ? 404 : 500,
    });
  }
}
