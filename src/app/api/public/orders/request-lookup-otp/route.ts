import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { requestOrderLookupOtp } from '@/server/guest-order-lookup';
import { extractClientIp } from '@/server/guest-otp';

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

    if (!result.success) {
      const status =
        result.code === 'NOT_FOUND'
          ? 404
          : result.code === 'RATE_LIMITED' || result.code === 'BLOCKED' || result.code === 'COOLDOWN'
            ? 429
            : 400;

      return Response.json(
        {
          message: result.error,
          code: result.code,
          cooldownSeconds: result.cooldownSeconds,
        },
        { status },
      );
    }

    return Response.json(
      {
        success: true,
        requestId: result.requestId,
        cooldownSeconds: result.cooldownSeconds,
        expiresInSeconds: result.expiresInSeconds,
        ...(result.devOtpCode ? { devOtpCode: result.devOtpCode } : {}),
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการขอรหัส OTP', { defaultStatus: 500 });
  }
}
