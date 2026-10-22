import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { rejectRefundRequest } from '@/server/refunds';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: refundRequestId } = await params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (session?.user.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้น' },
      { status: 403 },
    );
  }

  const pool = getDatabasePool();
  try {
    const body = await request.json().catch(() => ({}));
    const rejectionReason = body.rejectionReason || '';

    const result = await rejectRefundRequest(pool, {
      refundRequestId,
      rejectionReason,
      reviewerUserId: session.user.id,
      reviewerName: session.user.name,
      reviewerRole: session.user.role,
    });

    if (!result.success) {
      const status =
        result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;

      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json(
      { message: 'ปฏิเสธคำขอคืนเงินเรียบร้อยแล้ว' },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการปฏิเสธการคืนเงิน';
    return Response.json({ message }, { status: 500 });
  }
}
