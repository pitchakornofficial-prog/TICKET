import { getAuth } from '@/server/auth';
import { getOfflineDataset } from '@/server/primary-scanner';
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
    const dataset = await getOfflineDataset(
      pool,
      { id: session.user.id, role: session.user.role },
      eventId,
    );
    return Response.json(dataset, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงชุดข้อมูลออฟไลน์';
    const status = message.includes('ไม่อนุญาต') ? 403 : message.includes('ไม่พบ') ? 404 : 400;
    return Response.json({ message }, { status });
  }
}
