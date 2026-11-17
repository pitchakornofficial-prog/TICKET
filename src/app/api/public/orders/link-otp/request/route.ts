import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { requestOrderLinkOtp } from '@/server/guest-order-lookup';
import { extractClientIp } from '@/server/guest-otp';
import { isPayloadTooLargeError, readBoundedJson } from '@/server/http-body';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    let body: { orderId?: string; linkToken?: string } = {};
    try {
      body = await readBoundedJson<typeof body>(request, 32 * 1024);
    } catch (error) {
      if (isPayloadTooLargeError(error)) {
        return Response.json({ message: 'Payload too large' }, { status: 413 });
      }
    }
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const linkToken =
      typeof body?.linkToken === 'string'
        ? body.linkToken
        : request.headers.get('x-order-token') || '';

    const pool = getDatabasePool();
    const clientIp = extractClientIp(request);
    const result = await requestOrderLinkOtp(pool, {
      orderId,
      linkToken,
      clientIp,
    });

    if (!result.success) {
      const status =
        result.code === 'INVALID_LINK'
          ? 401
          : result.code === 'NOT_PAID'
            ? 403
            : result.code === 'RATE_LIMITED' || result.code === 'BLOCKED' || result.code === 'COOLDOWN'
              ? 429
              : 400;

      return Response.json(
        {
          message: result.error,
          code: result.code,
          maskedEmail: result.maskedEmail,
          cooldownSeconds: result.cooldownSeconds,
        },
        { status, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
      );
    }

    return Response.json(
      {
        success: true,
        requestId: result.requestId,
        maskedEmail: result.maskedEmail,
        cooldownSeconds: result.cooldownSeconds,
        expiresInSeconds: result.expiresInSeconds,
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการขอรหัส OTP', { defaultStatus: 500 });
  }
}
