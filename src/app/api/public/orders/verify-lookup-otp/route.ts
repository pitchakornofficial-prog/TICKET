import { getDatabasePool } from '@/server/database';
import { verifyOrderLookupOtp } from '@/server/guest-order-lookup';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, phone, code, requestId } = body || {};

    if (!email || !phone || !code || !requestId) {
      return Response.json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' }, { status: 400 });
    }

    const pool = getDatabasePool();
    const result = await verifyOrderLookupOtp(pool, {
      email,
      phone,
      code,
      requestId,
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
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการยืนยัน OTP';
    return Response.json({ message }, { status: 500 });
  }
}
