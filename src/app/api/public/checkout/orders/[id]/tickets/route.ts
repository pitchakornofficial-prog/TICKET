import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { getVerifiedGuestSession } from '@/server/guest-otp';
import {
  extractOrderRequestToken,
  resolveAuthorizedOrderReservation,
} from '@/server/order-access-token';
import { getOrderReservation } from '@/server/reservation';
import { getOrderTickets } from '@/server/tickets';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const pool = getDatabasePool();
  const token = extractOrderRequestToken(request);

  try {
    const authResult = await resolveAuthorizedOrderReservation({
      orderId,
      token,
      unauthorizedMessage: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนเปิดดูบัตรเข้างาน',
      forbiddenMessage: 'ท่านไม่มีสิทธิ์ในการเข้าถึงบัตรเข้างานของคำสั่งซื้อนี้',
      getOrderReservation: (id) => getOrderReservation(pool, id),
      getVerifiedGuestSession: (t) =>
        getVerifiedGuestSession(pool, t, new Date(), ['checkout', 'order_lookup']),
    });

    if (!authResult.ok) {
      return authResult.response;
    }

    if (authResult.reservation.status !== 'paid') {
      return Response.json(
        { message: 'คำสั่งซื้อนี้ยังไม่ได้รับการยืนยันการชำระเงิน จึงยังไม่มีบัตรที่ออกสำเร็จ' },
        { status: 400 },
      );
    }

    const tickets = await getOrderTickets(pool, orderId);
    return Response.json({ tickets }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาด', { defaultStatus: 500 });
  }
}
