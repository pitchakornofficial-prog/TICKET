import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getEventMoneyReport } from '@/server/reports';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บ' }, { status: 403 });
  }

  const { id } = await params;
  const pool = auth.options.database as Pool;

  try {
    const report = await getEventMoneyReport(
      pool,
      id,
      { id: session.user.id, role: 'owner' },
      { includeOrders: false },
    );
    const [tiers, privileges] = await Promise.all([
      pool.query<{
        id: string; name: string; price: number; quota: number; sold: number;
        gross: number; status: string; startTime: string;
      }>(
        `SELECT tt.id, tt.name, tt.price::float8 AS price, tt.quota, s.status, s."startTime",
                COUNT(t.id)::int AS sold,
                COALESCE(SUM(COALESCE(t.price, oi."unitPrice")), 0)::float8 AS gross
         FROM event_sessions s
         JOIN ticket_types tt ON tt."sessionId" = s.id
         LEFT JOIN tickets t ON t."ticketTypeId" = tt.id AND t."eventId" = s."eventId"
         LEFT JOIN order_items oi ON oi.id = t."orderItemId"
         WHERE s."eventId" = $1
         GROUP BY tt.id, s.id
         ORDER BY s."startTime", tt.price, tt.id`,
        [id],
      ),
      pool.query<{ ubuOrders: number; discountedOrders: number }>(
        `SELECT COUNT(*) FILTER (WHERE "ubuPrivilegeApplied")::int AS "ubuOrders",
                COUNT(*) FILTER (WHERE "discountAmount" > 0)::int AS "discountedOrders"
         FROM orders o
         WHERE o."eventId" = $1 AND EXISTS (SELECT 1 FROM tickets t WHERE t."orderId" = o.id)`,
        [id],
      ),
    ]);

    return Response.json({
      grossSales: report.grossSales,
      netEntitlement: report.netEntitlement,
      organizerFee: report.organizerFee,
      issuedTickets: report.totalTicketsIssuedCount,
      refundedTickets: report.totalTicketsRefundedCount,
      approvedRefunds: report.approvedRefundDeductions,
      ...privileges.rows[0],
      tiers: tiers.rows,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการโหลดสถิติคอนเสิร์ต', {
      defaultStatus: 500,
    });
  }
}
