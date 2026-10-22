import { getAuth } from '@/server/auth';
import { recordEventDebtRepayment } from '@/server/reports';
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
      { message: 'ไม่อนุญาต: เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์บันทึกรับเงินคืนจากผู้จัดงาน (AC-86)' },
      { status: 403 },
    );
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  let body: {
    amount?: number;
    notes?: string;
    repaidAt?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: 'ข้อมูลคำขอไม่ถูกต้อง กรุณาระบุจำนวนเงินที่ต้องการบันทึกรับคืน', code: 'INVALID_BODY' },
      { status: 400 },
    );
  }

  if (body.amount === undefined || body.amount === null || Number.isNaN(Number(body.amount))) {
    return Response.json(
      { message: 'กรุณาระบุจำนวนเงินที่รับคืนให้ถูกต้อง', code: 'INVALID_AMOUNT' },
      { status: 400 },
    );
  }

  try {
    const result = await recordEventDebtRepayment(pool, {
      eventId,
      amount: Number(body.amount),
      notes: body.notes,
      repaidAt: body.repaidAt ? new Date(body.repaidAt) : undefined,
      recordedBy: session.user.id,
      actorRole: session.user.role,
    });

    if (!result.success) {
      const status = result.code === 'FORBIDDEN' ? 403 : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json({ result }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกรับเงินคืนจากผู้จัดงาน';
    return Response.json({ message }, { status: 500 });
  }
}
