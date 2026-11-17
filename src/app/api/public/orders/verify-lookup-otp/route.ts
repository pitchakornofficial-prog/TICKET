import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { verifyOrderLookupOtp } from '@/server/guest-order-lookup';
import { isPayloadTooLargeError, readBoundedJson } from '@/server/http-body';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    let body: { email?: string; phone?: string; code?: string; requestId?: string; orderId?: string };
    try {
      body = await readBoundedJson<typeof body>(request, 32 * 1024);
    } catch (error) {
      const tooLarge = isPayloadTooLargeError(error);
      return Response.json({ message: tooLarge ? 'Payload too large' : 'Invalid JSON body' }, { status: tooLarge ? 413 : 400 });
    }
    const { email, phone, code, requestId, orderId } = body || {};

    if (!email || !phone || !code || !requestId) {
      return Response.json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' }, { status: 400 });
    }

    const pool = getDatabasePool();
    const result = await verifyOrderLookupOtp(pool, {
      email,
      phone,
      code,
      requestId,
      orderId,
    });

    if (!result.success) {
      const status = result.code === 'BLOCKED' ? 429 : 400;
      return Response.json(
        {
          message: result.error,
          code: result.code,
        },
        { status },
      );
    }

    return Response.json(
      {
        success: true,
        token: result.verifiedToken,
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการยืนยัน OTP', { defaultStatus: 500 });
  }
}
