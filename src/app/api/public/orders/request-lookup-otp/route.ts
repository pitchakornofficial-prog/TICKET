import { getDatabasePool } from '@/server/database';
import { requestOrderLookupOtp } from '@/server/guest-order-lookup';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, phone, orderId } = body || {};

    const pool = getDatabasePool();
    const result = await requestOrderLookupOtp(pool, {
      email,
      phone,
      orderId,
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
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการขอรหัส OTP';
    return Response.json({ message }, { status: 500 });
  }
}
