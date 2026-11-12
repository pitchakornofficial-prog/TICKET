import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { recordManualRefundFailure } from '@/server/refunds';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  try {
    const { id } = await params;
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'owner') {
      return Response.json(
        { message: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์บันทึกสถานะการโอนเงินล้มเหลว' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const failureReason = typeof body.failureReason === 'string' ? body.failureReason : '';

    const result = await recordManualRefundFailure(getDatabasePool(), {
      refundRequestId: id,
      failureReason,
      reviewerUserId: actor.id,
      reviewerName: actor.name,
      reviewerRole: actor.role,
    });

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404
        : result.code === 'FORBIDDEN' ? 403
        : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json(
      {
        message: 'บันทึกเหตุผลการโอนเงินล้มเหลวเรียบร้อยแล้ว ยอดหนี้ยังคงค้างชำระ',
        result,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการบันทึกการโอนเงินล้มเหลว', { defaultStatus: 500 });
  }
}
