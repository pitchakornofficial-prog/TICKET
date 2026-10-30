import { getAuth } from '@/server/auth';
import { resetScannerDeviceBinding } from '@/server/events';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; scannerId: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json(
      { message: 'ไม่มีสิทธิ์ : เฉพาะผู้จัดงานเท่านั้น' },
      { status: 403 },
    );
  }

  const { id: eventId, scannerId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const result = await resetScannerDeviceBinding(pool, session.user.id, eventId, scannerId);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการรีเซ็ตอุปกรณ์';
    const status = message.includes('ไม่มีสิทธิ์') ? 403 : 400;
    return Response.json({ message }, { status });
  }
}
