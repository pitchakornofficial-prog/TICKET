import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { getVerifiedGuestSession } from '@/server/guest-otp';
import sharp from 'sharp';

export const runtime = 'nodejs';

function extractVerifiedToken(request: Request): string {
  const url = new URL(request.url);
  return (
    request.headers.get('x-guest-token') ||
    request.headers.get('x-guest-session') ||
    request.headers.get('x-order-token') ||
    url.searchParams.get('token') ||
    url.searchParams.get('verifiedToken') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  );
}

async function flattenQrToPngBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(536, 536, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .extend({
      top: 32,
      bottom: 32,
      left: 32,
      right: 32,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const pool = getDatabasePool();
  const token = extractVerifiedToken(request);
  const isInline = new URL(request.url).searchParams.get('inline') === '1';

  if (!token) {
    return Response.json(
      { message: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนดาวน์โหลด QR ชำระเงิน' },
      { status: 401 },
    );
  }

  try {
    const now = new Date();

    // Verify session belongs to buyer of this order (checkout or order_lookup purpose)
    const verifiedSession = await getVerifiedGuestSession(pool, token, now, [
      'checkout',
      'order_lookup',
      `order_lookup:${orderId}`,
    ]);

    if (!verifiedSession) {
      return Response.json(
        { message: 'เซสชันการยืนยันตัวตนหมดอายุหรือไม่มีสิทธิ์' },
        { status: 401 },
      );
    }

    const orderRes = await pool.query<{
      id: string;
      buyerEmail: string;
      qrCodeUrl: string | null;
      status: string;
    }>(
      `SELECT o.id, o."buyerEmail", pc."qrCodeUrl", pc.status
       FROM orders o
       JOIN payment_charges pc ON pc."orderId" = o.id
       WHERE o.id = $1
       ORDER BY pc."createdAt" DESC
       LIMIT 1`,
      [orderId],
    );

    if (orderRes.rowCount === 0) {
      return Response.json(
        { message: 'ไม่พบรายการชำระเงินสำหรับคำสั่งซื้อนี้' },
        { status: 404 },
      );
    }

    const order = orderRes.rows[0];
    if (order.buyerEmail.toLowerCase() !== verifiedSession.email.toLowerCase()) {
      return Response.json(
        { message: 'ท่านไม่มีสิทธิ์ในการดาวน์โหลด QR Code สำหรับคำสั่งซื้อนี้' },
        { status: 403 },
      );
    }

    const qrCodeUrl = order.qrCodeUrl;
    if (!qrCodeUrl) {
      return Response.json(
        { message: 'ไม่พบรูปภาพ QR Code ชำระเงิน' },
        { status: 404 },
      );
    }

    let pngBuffer: Buffer;

    if (qrCodeUrl.startsWith('data:image/svg+xml')) {
      const svgText = decodeURIComponent(
        qrCodeUrl.replace(/^data:image\/svg\+xml;?(utf8|charset=utf-8)?,/i, ''),
      );
      pngBuffer = await flattenQrToPngBuffer(Buffer.from(svgText));
    } else if (qrCodeUrl.startsWith('http://') || qrCodeUrl.startsWith('https://')) {
      const upstreamRes = await fetch(qrCodeUrl, {
        signal: AbortSignal.timeout(8000),
      });
      if (!upstreamRes.ok) {
        throw new Error(`Failed to fetch QR image from upstream provider: ${upstreamRes.status}`);
      }
      const arrayBuffer = await upstreamRes.arrayBuffer();
      pngBuffer = await flattenQrToPngBuffer(Buffer.from(arrayBuffer));
    } else {
      return Response.json(
        { message: 'รูปแบบ QR Code ไม่ถูกต้อง' },
        { status: 400 },
      );
    }

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="promptpay-qr-${orderId}.png"`,
        'Cache-Control': 'private, no-cache, no-store',
      },
    });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดาวน์โหลดภาพ QR Code ชำระเงิน', {
      defaultStatus: 500,
    });
  }
}
