import { getAuth } from '@/server/auth';
import { syncOfflineAdmissionScans } from '@/server/admission';
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

  const { role, id, name } = session.user;
  if (!['scanner', 'organizer', 'owner'].includes(role)) {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะทีมงานที่ได้รับสิทธิ์เท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const body = await request.json();
    const scans = Array.isArray(body?.scans) ? body.scans : [];

    const result = await syncOfflineAdmissionScans(
      pool,
      { id, role, name },
      eventId,
      { scans },
    );

    return Response.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการซิงก์ข้อมูลออฟไลน์';
    const status = message.includes('ไม่อนุญาต') ? 403 : 500;
    return Response.json({ message }, { status });
  }
}
