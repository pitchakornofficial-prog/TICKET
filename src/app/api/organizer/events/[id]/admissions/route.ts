import { getAuth } from '@/server/auth';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer' && session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    if (session.user.role === 'organizer') {
      const evCheck = await pool.query<{ organizerId: string }>(
        'SELECT "organizerId" FROM events WHERE id = $1',
        [eventId],
      );
      if (evCheck.rowCount === 0 || evCheck.rows[0].organizerId !== session.user.id) {
        return Response.json({ message: 'คุณไม่มีสิทธิ์ดูข้อมูลของงานนี้' }, { status: 403 });
      }
    }

    const res = await pool.query(
      `SELECT l.id, l."ticketCode", l.action, l.status, l.reason, l."scannerName", l."deviceMode", l."createdAt",
              tt.name AS "ticketTypeName"
       FROM ticket_admission_logs l
       LEFT JOIN tickets t ON t.id = l."ticketId"
       LEFT JOIN ticket_types tt ON tt.id = t."ticketTypeId"
       WHERE l."eventId" = $1
       ORDER BY l."createdAt" DESC
       LIMIT 100`,
      [eventId],
    );

    return Response.json({ logs: res.rows }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงประวัติการสแกน';
    return Response.json({ message }, { status: 500 });
  }
}
