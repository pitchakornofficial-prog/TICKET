import { getDatabasePool } from '@/server/database';
import { createPaymentQr, getPaymentChargeForOrder } from '@/server/payment';

export const runtime = 'nodejs';

function extractVerifiedToken(request: Request, body?: { verifiedToken?: string }): string {
  const url = new URL(request.url);
  return (
    body?.verifiedToken ||
    request.headers.get('x-guest-token') ||
    request.headers.get('x-guest-session') ||
    request.headers.get('x-order-token') ||
    url.searchParams.get('token') ||
    url.searchParams.get('verifiedToken') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const pool = getDatabasePool();

  try {
    const body = await request.json().catch(() => ({}));
    const verifiedToken = extractVerifiedToken(request, body);

    if (!verifiedToken) {
      return Response.json(
        { message: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนขอรับ QR ชำระเงิน (AC-12)' },
        { status: 401 },
      );
    }

    const charge = await createPaymentQr(pool, { orderId, verifiedToken });
    return Response.json({ charge }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการสร้าง QR ชำระเงิน';
    const status = message.includes('สิทธิ์') ? 403 : message.includes('OTP') ? 401 : 400;
    return Response.json({ message }, { status });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const pool = getDatabasePool();
  const verifiedToken = extractVerifiedToken(request);

  if (!verifiedToken) {
    return Response.json(
      { message: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนเข้าถึงข้อมูลการชำระเงิน (AC-12)' },
      { status: 401 },
    );
  }

  try {
    const charge = await getPaymentChargeForOrder(pool, orderId, verifiedToken);
    if (!charge) {
      return Response.json({ message: 'ยังไม่มีข้อมูลการชำระเงินสำหรับคำสั่งซื้อนี้' }, { status: 404 });
    }
    return Response.json({ charge }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    const status = message.includes('สิทธิ์') ? 403 : message.includes('OTP') ? 401 : 500;
    return Response.json({ message }, { status });
  }
}
