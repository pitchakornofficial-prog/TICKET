import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { recordManualRefundTransfer } from '@/server/refunds';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'owner') {
      return Response.json(
        { message: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์บันทึกการโอนเงินคืน (AC-37, AC-92)' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const transferredAmount = body.transferredAmount !== undefined
      ? Number(body.transferredAmount)
      : undefined;
    const transferProofKey = typeof body.transferProofKey === 'string' ? body.transferProofKey : undefined;
    const transferProofUrl = typeof body.transferProofUrl === 'string' ? body.transferProofUrl : undefined;
    const transferNote = typeof body.transferNote === 'string' ? body.transferNote : undefined;
    const transferredAt = body.transferredAt ? new Date(body.transferredAt) : undefined;

    const result = await recordManualRefundTransfer(getDatabasePool(), {
      refundRequestId: id,
      transferredAmount,
      transferProofKey,
      transferProofUrl,
      transferNote,
      reviewerUserId: actor.id,
      reviewerName: actor.name,
      reviewerRole: actor.role,
      transferredAt,
    });

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404
        : result.code === 'FORBIDDEN' ? 403
        : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json(
      {
        message: result.alreadyCompleted
          ? 'คำขอคืนเงินนี้ได้รับการบันทึกการโอนเรียบร้อยแล้ว'
          : 'บันทึกการโอนเงินคืนสำเร็จ ปรับสถานะเป็นโอนสำเร็จ (Completed) เรียบร้อยแล้ว',
        result,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกการโอนเงินคืน';
    return Response.json({ message }, { status: 500 });
  }
}
