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

  if (session?.user.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้ดูแลระบบ (Owner) เท่านั้น' },
      { status: 403 },
    );
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const report = await getEventMoneyReport(pool, eventId, {
      id: session.user.id,
      role: 'owner',
    });

    return Response.json({ report }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงรายงานการเงิน';
    const status = message.includes('ไม่พบ') ? 404 : 500;
    return Response.json({ message }, { status });
  }
}
