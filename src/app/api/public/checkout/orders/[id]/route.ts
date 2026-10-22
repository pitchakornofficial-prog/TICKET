import { getDatabasePool } from '@/server/database';
import { getOrderReservation } from '@/server/reservation';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const pool = getDatabasePool();

  try {
    const reservation = await getOrderReservation(pool, orderId);
    if (!reservation) {
      return Response.json({ message: 'ไม่พบรายการคำสั่งซื้อ' }, { status: 404 });
    }
    return Response.json({ reservation }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return Response.json({ message }, { status: 500 });
  }
}
