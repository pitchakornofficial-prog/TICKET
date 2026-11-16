import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { requestOrderLookupOtp } from '@/server/guest-order-lookup';
import { extractClientIp } from '@/server/guest-otp';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, phone, orderId } = body || {};

    const pool = getDatabasePool();
    const clientIp = extractClientIp(request);
    const result = await requestOrderLookupOtp(pool, {
      email,
      phone,
      orderId,
      clientIp,
    });

    if (!result.success && result.code === 'INVALID_INPUT') {
      return Response.json(
        { message: result.error, code: result.code },
        { status: 400, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
      );
    }

    return Response.json(
      {
        success: true,
        message: 'หากคำขอนี้ตรงกับรายการซื้อ OTP จะถูกส่งไปยังอีเมล กรุณาตรวจกล่องจดหมายและลองใหม่ภายหลังหากยังไม่ได้รับ',
        requestId: result.success ? result.requestId : randomUUID(),
        cooldownSeconds: 60,
        expiresInSeconds: 300,
        ...(result.success && result.devOtpCode ? { devOtpCode: result.devOtpCode } : {}),
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการขอรหัส OTP', { defaultStatus: 500 });
  }
}
