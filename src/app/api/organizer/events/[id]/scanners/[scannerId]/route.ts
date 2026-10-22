import { getAuth } from '@/server/auth';
import { removeScannerFromEvent } from '@/server/events';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; scannerId: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น' }, { status: 403 });
  }

  const { id: eventId, scannerId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const success = await removeScannerFromEvent(pool, session.user.id, eventId, scannerId);
    if (!success) {
      return Response.json({ message: 'ไม่พบข้อมูลทีมสแกนในงานนี้' }, { status: 404 });
    }
    return Response.json({ message: 'นำทีมสแกนออกจากงานสำเร็จ' }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการลบทีมสแกน';
    const status = message.includes('ไม่มีสิทธิ์') ? 403 : 400;
    return Response.json({ message }, { status });
  }
}
