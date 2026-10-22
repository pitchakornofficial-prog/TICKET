import { getDatabasePool } from '@/server/database';
import { requestGuestOtp } from '@/server/guest-otp';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: {
    buyer?: { name?: string; email?: string; phone?: string };
    purpose?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.buyer) {
    return Response.json({ message: 'กรุณาระบุข้อมูลผู้ซื้อ' }, { status: 400 });
  }

  const pool = getDatabasePool();
  try {
    const result = await requestGuestOtp(pool, {
      buyer: body.buyer,
      purpose: body.purpose || 'checkout',
    });

    if (!result.success) {
      const status =
        result.code === 'MISSING_FIELDS'
          ? 400
          : result.code === 'COOLDOWN' || result.code === 'RATE_LIMITED' || result.code === 'BLOCKED'
            ? 429
            : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json(
      {
        message: 'ส่งรหัส OTP ไปยังอีเมลของคุณเรียบร้อยแล้ว',
        requestId: result.requestId,
        cooldownSeconds: result.cooldownSeconds,
        expiresInSeconds: result.expiresInSeconds,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการส่งรหัส OTP';
    return Response.json({ message }, { status: 500 });
  }
}
