import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { getOrderRefundEligibility, getOrderRefundRequests } from '@/server/refunds';
import { getVerifiedGuestSession } from '@/server/guest-otp';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const authHeader = request.headers.get('authorization');
  const sessionHeader = request.headers.get('x-guest-session');

  const token = sessionHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!token) {
    return Response.json(
      { message: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนตรวจสอบสิทธิ์การคืนเงิน (AC-21)' },
      { status: 401 },
    );
  }

  try {
    const pool = getDatabasePool();

    // Verify session
    const session = await getVerifiedGuestSession(pool, token, new Date(), 'order_lookup');
    if (!session) {
      return Response.json(
        { message: 'เซสชันหมดอายุหรือไม่มีสิทธิ์ กรุณายืนยันตัวตนใหม่' },
        { status: 401 },
      );
    }

    const orderCheck = await pool.query<{ buyerEmail: string }>(
      `SELECT "buyerEmail" FROM orders WHERE id = $1`,
      [orderId],
    );
    if (orderCheck.rowCount === 0) {
      return Response.json({ message: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });
    }
    if (orderCheck.rows[0].buyerEmail.toLowerCase() !== session.email.toLowerCase()) {
      return Response.json({ message: 'ท่านไม่มีสิทธิ์ในการเข้าถึงคำสั่งซื้อนี้' }, { status: 403 });
    }

    const eligibility = await getOrderRefundEligibility(pool, orderId);
    const requests = await getOrderRefundRequests(pool, orderId);

    return Response.json(
      {
        eligibility,
        requests,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์การคืนเงิน', {
      defaultStatus: 500,
      statusResolver: (msg) => (msg.includes('ไม่พบ') ? 404 : 500),
    });
  }
}
