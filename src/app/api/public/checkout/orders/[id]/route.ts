import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { getOrderReservation } from '@/server/reservation';
import { getVerifiedGuestSession } from '@/server/guest-otp';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const pool = getDatabasePool();
  const url = new URL(request.url);

  const token =
    request.headers.get('x-guest-token') ||
    request.headers.get('x-guest-session') ||
    request.headers.get('x-order-token') ||
    url.searchParams.get('token') ||
    url.searchParams.get('verifiedToken') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';

  if (!token) {
    return Response.json(
      { message: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนเข้าถึงข้อมูลคำสั่งซื้อ (AC-12, G-17)' },
      { status: 401 },
    );
  }

  try {
    const verifiedSession = await getVerifiedGuestSession(pool, token);
    if (!verifiedSession) {
      return Response.json(
        { message: 'Session ยืนยันตัวตนไม่ถูกต้องหรือหมดอายุแล้ว กรุณายืนยัน OTP ใหม่' },
        { status: 401 },
      );
    }

    const reservation = await getOrderReservation(pool, orderId);
    if (!reservation) {
      return Response.json({ message: 'ไม่พบรายการคำสั่งซื้อ' }, { status: 404 });
    }

    if (reservation.buyerEmail.toLowerCase() !== verifiedSession.email.toLowerCase()) {
      return Response.json(
        { message: 'ท่านไม่มีสิทธิ์ในการเข้าถึงข้อมูลคำสั่งซื้อนี้' },
        { status: 403 },
      );
    }

    return Response.json({ reservation }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาด', { defaultStatus: 500 });
  }
}
