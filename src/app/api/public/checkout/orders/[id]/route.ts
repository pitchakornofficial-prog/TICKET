import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { getVerifiedGuestSession } from '@/server/guest-otp';
import {
  extractOrderRequestToken,
  resolveAuthorizedOrderReservation,
} from '@/server/order-access-token';
import { getOrderReservation } from '@/server/reservation';

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
      unauthorizedMessage: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนเข้าถึงข้อมูลคำสั่งซื้อ',
      forbiddenMessage: 'ท่านไม่มีสิทธิ์ในการเข้าถึงข้อมูลคำสั่งซื้อนี้',
      getOrderReservation: (id) => getOrderReservation(pool, id),
      getVerifiedGuestSession: (t) =>
        getVerifiedGuestSession(pool, t, new Date(), ['checkout', 'order_lookup']),
    });

    if (!authResult.ok) {
      return authResult.response;
    }

    return Response.json(
      { reservation: authResult.reservation },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาด', { defaultStatus: 500 });
  }
}
