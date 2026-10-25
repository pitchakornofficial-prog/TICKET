import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { getOwnerOverviewCounts } from '@/server/overview';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return Response.json({ message: 'ไม่อนุญาต: กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  if (session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น (403)' }, { status: 403 });
  }

  const pool = getDatabasePool();
  try {
    const counts = await getOwnerOverviewCounts(pool);
    return Response.json(counts, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดตัวเลขภาพรวม';
    return Response.json({ message }, { status: 500 });
  }
}
