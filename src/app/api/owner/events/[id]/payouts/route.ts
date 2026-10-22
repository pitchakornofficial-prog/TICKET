import { getAuth } from '@/server/auth';
import { recordEventPayout } from '@/server/reports';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json(
      { message: 'Unauthorized: กรุณาเข้าสู่ระบบ' },
      { status: 401 },
    );
  }

  if (session.user.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์บันทึกการโอนเงิน (AC-27)' },
      { status: 403 },
    );
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  let body: {
    amount?: number;
    status?: 'completed' | 'failed';
    paidAt?: string;
    transferProofKey?: string;
    transferProofUrl?: string;
    transferNote?: string;
    transferFailureReason?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    const result = await recordEventPayout(pool, {
      eventId,
      amount: Number(body.amount || 0),
      status: body.status || 'completed',
      paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
      transferProofKey: body.transferProofKey,
      transferProofUrl: body.transferProofUrl,
      transferNote: body.transferNote,
      transferFailureReason: body.transferFailureReason,
      recordedBy: session.user.id,
      actorRole: session.user.role,
    });

    if (!result.success) {
      const status = result.code === 'FORBIDDEN' ? 403 : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json({ result }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกการโอนเงิน';
    return Response.json({ message }, { status: 500 });
  }
}
