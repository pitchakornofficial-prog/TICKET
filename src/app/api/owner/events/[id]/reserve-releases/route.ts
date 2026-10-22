import { getAuth } from '@/server/auth';
import { recordEventReserveRelease } from '@/server/reports';
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
      { message: 'ไม่อนุญาต: เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์สั่งปล่อยเงินสำรอง (AC-83)' },
      { status: 403 },
    );
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  let body: {
    amount?: number;
    notes?: string;
    releasedAt?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    // Body is optional (defaults to releasing full held reserve)
  }

  try {
    const result = await recordEventReserveRelease(pool, {
      eventId,
      amount: body.amount !== undefined && body.amount !== null ? Number(body.amount) : undefined,
      notes: body.notes,
      releasedAt: body.releasedAt ? new Date(body.releasedAt) : undefined,
      recordedBy: session.user.id,
      actorRole: session.user.role,
    });

    if (!result.success) {
      const status = result.code === 'FORBIDDEN' ? 403 : 400;
      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json({ result }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกการปล่อยเงินสำรอง';
    return Response.json({ message }, { status: 500 });
  }
}
