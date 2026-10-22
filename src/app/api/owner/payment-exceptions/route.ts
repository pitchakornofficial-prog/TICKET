import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { listPaymentRecoveryCases } from '@/server/payment';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const pool = getDatabasePool();
  try {
    const cases = await listPaymentRecoveryCases(pool);
    return Response.json({ cases }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดรายการตรวจสอบ';
    return Response.json({ message }, { status: 500 });
  }
}
