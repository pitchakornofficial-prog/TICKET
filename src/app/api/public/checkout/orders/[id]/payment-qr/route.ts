import { getDatabasePool } from '@/server/database';
import { createPaymentQr, getPaymentChargeForOrder } from '@/server/payment';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const pool = getDatabasePool();

  try {
    const body = await request.json().catch(() => ({}));
    const verifiedToken =
      body.verifiedToken ||
      request.headers.get('x-guest-token') ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      '';

    const charge = await createPaymentQr(pool, { orderId, verifiedToken });
    return Response.json({ charge }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการสร้าง QR ชำระเงิน';
    const status = message.includes('สิทธิ์') || message.includes('OTP') ? 403 : 400;
    return Response.json({ message }, { status });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const pool = getDatabasePool();
  const url = new URL(request.url);
  const verifiedToken =
    url.searchParams.get('token') ||
    request.headers.get('x-guest-token') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';

  try {
    const charge = await getPaymentChargeForOrder(pool, orderId, verifiedToken || undefined);
    if (!charge) {
      return Response.json({ message: 'ยังไม่มีข้อมูลการชำระเงินสำหรับคำสั่งซื้อนี้' }, { status: 404 });
    }
    return Response.json({ charge }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    const status = message.includes('สิทธิ์') || message.includes('OTP') ? 403 : 500;
    return Response.json({ message }, { status });
  }
}
