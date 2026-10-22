import { getAuth } from '@/server/auth';
import { resolveAdmissionSyncConflict } from '@/server/admission';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return Response.json({ message: 'ไม่อนุญาต: กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  if (session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น (403)' }, { status: 403 });
  }

  const { id: conflictId } = await params;
  const pool = auth.options.database as Pool;

  try {
    let resolutionNotes: string | undefined;
    try {
      const body = await request.json();
      resolutionNotes = body?.resolutionNotes;
    } catch {
      // Body is optional
    }

    const success = await resolveAdmissionSyncConflict(
      pool,
      conflictId,
      { id: session.user.id, role: session.user.role, name: session.user.name },
      resolutionNotes,
    );

    return Response.json({ success, message: 'บันทึกการตรวจสอบและปิดข้อขัดแย้งเรียบร้อยแล้ว' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการปิดข้อขัดแย้ง';
    return Response.json({ message }, { status: 500 });
  }
}
