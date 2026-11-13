import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getOrganizerFinanceSummaries } from '@/server/reports';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json(
      { message: 'กรุณาเข้าสู่ระบบก่อนเข้าถึงสรุปข้อมูลการเงิน' },
      { status: 401 },
    );
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' },
      { status: 403 },
    );
  }

  const pool = auth.options.database as Pool;
  const { searchParams } = new URL(request.url, 'http://localhost');
  const organizerId = searchParams.get('organizerId') || undefined;

  try {
    const summaries = await getOrganizerFinanceSummaries(
      pool,
      {
        id: session.user.id,
        role: session.user.role as 'organizer' | 'owner',
      },
      organizerId,
    );

    return Response.json({ summaries }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงสรุปข้อมูลการเงิน', {
      defaultStatus: 500,
      statusResolver: (msg) => (msg.includes('ไม่อนุญาต') ? 403 : 500),
    });
  }
}
