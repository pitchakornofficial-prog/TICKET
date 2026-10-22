import { getDatabasePool } from '@/server/database';
import { getOrderTickets } from '@/server/tickets';
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

    if (reservation.status !== 'paid') {
      return Response.json(
        { message: 'คำสั่งซื้อนี้ยังไม่ได้รับการยืนยันการชำระเงิน จึงยังไม่มีบัตรที่ออกสำเร็จ' },
        { status: 400 },
      );
    }

    const tickets = await getOrderTickets(pool, orderId);
    return Response.json({ tickets }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return Response.json({ message }, { status: 500 });
  }
}
