import { getDatabasePool } from '@/server/database';
import { lookupGuestOrders } from '@/server/guest-order-lookup';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const sessionHeader = request.headers.get('x-guest-session');

  const token = sessionHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!token) {
    return Response.json(
      { message: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนเปิดดูรายการคำสั่งซื้อ' },
      { status: 401 },
    );
  }

  try {
    const pool = getDatabasePool();
    const result = await lookupGuestOrders(pool, { verifiedToken: token });

    if (!result.success) {
      return Response.json({ message: result.error }, { status: 401 });
    }

    return Response.json(
      {
        orders: result.orders,
        buyer: result.buyer,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการค้นหาคำสั่งซื้อ';
    return Response.json({ message }, { status: 500 });
  }
}
