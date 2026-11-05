import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { getEventOfflineControl } from '@/server/primary-scanner';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  const pool = (auth.options.database as Pool) || getDatabasePool();

  try {
    if (session.user.role === 'organizer') {
      const evCheck = await pool.query<{ organizerId: string }>(
        'SELECT "organizerId" FROM events WHERE id = $1',
        [eventId],
      );
      if (evCheck.rowCount === 0) {
        return Response.json({ message: 'ไม่พบคอนเสิร์ตที่ระบุ' }, { status: 404 });
      }
      if (evCheck.rows[0].organizerId !== session.user.id) {
        return Response.json(
          { message: 'Forbidden: คุณไม่มีสิทธิ์ดูสถานะเครื่องหลักของคอนเสิร์ตนี้' },
          { status: 403 },
        );
      }
    }

    const data = await getEventOfflineControl(pool, eventId);
    return Response.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงสถานะออฟไลน์';
    return Response.json({ message }, { status: 500 });
  }
}
