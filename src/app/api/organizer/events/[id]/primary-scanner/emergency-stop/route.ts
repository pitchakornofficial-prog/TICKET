import { getAuth } from '@/server/auth';
import { emergencyStopOffline } from '@/server/primary-scanner';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  let body: {
    reason?: string;
    details?: string;
    lostPendingCount?: number;
  } = {};

  try {
    body = await request.json();
  } catch {
    // Body optional
  }

  const pool = auth.options.database as Pool;

  try {
    const control = await emergencyStopOffline(
      pool,
      { id: session.user.id, role: session.user.role, name: session.user.name },
      eventId,
      {
        reason: body.reason,
        details: body.details,
        lostPendingCount: body.lostPendingCount,
      },
    );

    return Response.json(
      {
        message: 'ระงับการใช้งานสแกนออฟไลน์เพื่อเข้าสู่กระบวนการกระทบยอดเรียบร้อยแล้ว (AC-98, NQ-06)',
        control,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการระงับการใช้งานออฟไลน์';
    const status = message.includes('ไม่อนุญาต') ? 403 : message.includes('ไม่พบ') ? 404 : 400;
    return Response.json({ message }, { status });
  }
}
