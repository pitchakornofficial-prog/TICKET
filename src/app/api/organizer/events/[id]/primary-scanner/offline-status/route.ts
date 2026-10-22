import { getAuth } from '@/server/auth';
import { getEventOfflineControl } from '@/server/primary-scanner';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const data = await getEventOfflineControl(pool, eventId);
    return Response.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงสถานะออฟไลน์';
    return Response.json({ message }, { status: 500 });
  }
}
