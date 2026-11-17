import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { submitRefundRequest } from '@/server/refunds';
import { isPayloadTooLargeError, readBoundedJson } from '@/server/http-body';

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
      { message: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนยื่นคำขอคืนเงิน' },
      { status: 401 },
    );
  }

  try {
    let body: { ticketIds?: string[]; reason?: string; bankName?: string; bankAccountNo?: string; bankAccountName?: string };
    try {
      body = await readBoundedJson<typeof body>(request, 32 * 1024);
    } catch (error) {
      const tooLarge = isPayloadTooLargeError(error);
      return Response.json({ message: tooLarge ? 'Payload too large' : 'Invalid JSON body' }, { status: tooLarge ? 413 : 400 });
    }
    if (!Array.isArray(body.ticketIds) || typeof body.reason !== 'string'
      || typeof body.bankName !== 'string' || typeof body.bankAccountNo !== 'string'
      || typeof body.bankAccountName !== 'string') {
      return Response.json({ message: 'ข้อมูลคำขอคืนเงินไม่ถูกต้อง' }, { status: 400 });
    }
    const { ticketIds, reason, bankName, bankAccountNo, bankAccountName } = body;

    const pool = getDatabasePool();
    const result = await submitRefundRequest(pool, {
      verifiedToken: token,
      orderId,
      ticketIds,
      reason,
      bankName,
      bankAccountNo,
      bankAccountName,
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
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการยื่นคำขอคืนเงิน', { defaultStatus: 500 });
  }
}
