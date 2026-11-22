import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getEventMoneyReport, parseMoneyReportQueryOptions } from '@/server/reports';
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
    const options = parseMoneyReportQueryOptions(request.url);
    const report = await getEventMoneyReport(
      pool,
      eventId,
      {
        id: session.user.id,
        role: 'owner',
      },
      options,
    );

    const tierRes = await pool.query<{
      id: string;
      name: string;
      price: string;
      quota: number;
      isStudentPrivilege: boolean;
      soldCount: number;
      grossSales: string;
    }>(
      `SELECT tt.id, tt.name, tt.price::text, tt.quota, tt."isStudentPrivilege",
              COALESCE(COUNT(t.id) FILTER (WHERE t.status IN ('valid', 'used')), 0)::int AS "soldCount",
              COALESCE(SUM(t."ticketPrice") FILTER (WHERE t.status IN ('valid', 'used')), 0)::text AS "grossSales"
       FROM ticket_types tt
       JOIN event_sessions s ON s.id = tt."sessionId"
       LEFT JOIN tickets t ON t."ticketTypeId" = tt.id
       WHERE s."eventId" = $1
       GROUP BY tt.id, tt.name, tt.price, tt.quota, tt."isStudentPrivilege"
       ORDER BY tt.price DESC`,
      [eventId],
    );

    const ticketTiers = tierRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: Number(r.price),
      quota: Number(r.quota),
      isStudentPrivilege: Boolean(r.isStudentPrivilege),
      soldCount: Number(r.soldCount),
      grossSales: Number(r.grossSales),
    }));

    const studentRes = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM tickets t
       JOIN ticket_types tt ON tt.id = t."ticketTypeId"
       WHERE t."eventId" = $1 AND tt."isStudentPrivilege" = true AND t.status IN ('valid', 'used')`,
      [eventId],
    );
    const studentPrivilegeCount = studentRes.rows[0]?.count ?? 0;

    return Response.json(
      { report, ticketTiers, studentPrivilegeCount },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงรายงานการเงิน', {
      defaultStatus: 500,
      statusResolver: (msg) => msg.includes('ไม่พบ') ? 404 : 500,
    });
  }
}
