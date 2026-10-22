import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { listAllRefundRequests } from '@/server/refunds';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้น' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status') || undefined;

  const pool = getDatabasePool();
  try {
    const refundRequests = await listAllRefundRequests(pool, { status: statusParam });
    return Response.json(
      { requests: refundRequests },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดรายการคำขอคืนเงิน';
    return Response.json({ message }, { status: 500 });
  }
}
