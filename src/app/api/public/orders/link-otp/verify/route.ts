import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { verifyOrderLinkOtp } from '@/server/guest-order-lookup';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const linkToken =
      typeof body?.linkToken === 'string'
        ? body.linkToken
        : request.headers.get('x-order-token') || '';
    const code = typeof body?.code === 'string' ? body.code : '';
    const requestId = typeof body?.requestId === 'string' ? body.requestId : '';

    if (!orderId || !linkToken || !code || !requestId) {
      return Response.json(
        { message: 'กรุณากรอกข้อมูลการยืนยัน OTP ให้ครบถ้วน' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const pool = getDatabasePool();
    const result = await verifyOrderLinkOtp(pool, {
      orderId,
      linkToken,
      code,
      requestId,
    });

    if (!result.success) {
      const status =
        result.code === 'INVALID_LINK'
          ? 401
          : result.code === 'NOT_PAID'
            ? 403
            : result.code === 'BLOCKED'
              ? 429
              : 400;

      return Response.json(
        {
          message: result.error,
          code: result.code,
        },
        { status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json(
      {
        success: true,
        token: result.verifiedToken,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการยืนยัน OTP', { defaultStatus: 500 });
  }
}
