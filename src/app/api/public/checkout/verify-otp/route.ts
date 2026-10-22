import { getDatabasePool } from '@/server/database';
import { verifyGuestOtp } from '@/server/guest-otp';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: {
    email?: string;
    code?: string;
    requestId?: string;
    purpose?: string;
    buyer?: { name?: string; email?: string; phone?: string };
  } = {};

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.email || !body.code || !body.requestId || !body.buyer) {
    return Response.json({ message: 'กรุณาระบุข้อมูลให้ครบถ้วน' }, { status: 400 });
  }

  const pool = getDatabasePool();
  try {
    const result = await verifyGuestOtp(pool, {
      email: body.email,
      code: body.code,
      requestId: body.requestId,
      purpose: body.purpose || 'checkout',
      buyer: body.buyer,
    });

    if (!result.success) {
      const status = result.code === 'BLOCKED' ? 429 : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json(
      {
        message: 'ยืนยันรหัส OTP สำเร็จ',
        verifiedToken: result.verifiedToken,
        buyer: result.buyer,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการยืนยัน OTP';
    return Response.json({ message }, { status: 500 });
  }
}
