import { getDatabasePool } from '@/server/database';
import { submitRefundRequest } from '@/server/refunds';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const authHeader = request.headers.get('authorization');
  const sessionHeader = request.headers.get('x-guest-session');

  const token = sessionHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!token) {
    return Response.json(
      { message: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนยื่นคำขอคืนเงิน (AC-21)' },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { ticketIds, reason, bankName, bankAccountNo, bankAccountName, now } = body;

    const pool = getDatabasePool();
    const result = await submitRefundRequest(pool, {
      verifiedToken: token,
      orderId,
      ticketIds,
      reason,
      bankName,
      bankAccountNo,
      bankAccountName,
      now: now ? new Date(now) : undefined,
    });

    if (!result.success) {
      let status = 400;
      if (result.code === 'UNAUTHORIZED') status = 401;
      else if (result.code === 'FORBIDDEN') status = 403;
      else if (result.code === 'NOT_FOUND') status = 404;
      else if (result.code === 'DUPLICATE_REFUND_REQUEST') status = 409;
      else if (result.code === 'PAST_REFUND_CUTOFF') status = 422;

      return Response.json(
        { message: result.error, code: result.code },
        { status },
      );
    }

    return Response.json(
      {
        message: 'ยื่นคำขอคืนเงินเรียบร้อยแล้ว อยู่ระหว่างรอผู้จัด/ผู้ดูแลระบบตรวจสอบ',
        refundRequestId: result.refundRequestId,
        requestedAmount: result.requestedAmount,
        ticketCount: result.ticketCount,
        status: result.status,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการยื่นคำขอคืนเงิน';
    return Response.json({ message }, { status: 500 });
  }
}
