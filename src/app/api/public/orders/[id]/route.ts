import { getDatabasePool } from '@/server/database';
import { getGuestOrderDetail } from '@/server/guest-order-lookup';

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
      { message: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนเปิดดูคำสั่งซื้อ' },
      { status: 401 },
    );
  }

  try {
    const pool = getDatabasePool();
    const result = await getGuestOrderDetail(pool, {
      verifiedToken: token,
      orderId,
    });

    if (!result.success) {
      const status =
        result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 401;

      return Response.json({ message: result.error }, { status });
    }

    return Response.json(
      {
        order: result.order,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงข้อมูลคำสั่งซื้อ';
    return Response.json({ message }, { status: 500 });
  }
}
