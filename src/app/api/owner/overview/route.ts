import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { getOwnerOverviewCounts, getOwnerOverviewSales } from '@/server/overview';

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
    const sales = new URL(request.url).searchParams.get('sales') === 'true'
      ? await getOwnerOverviewSales(pool, session.user.id)
      : undefined;
    return Response.json({ ...counts, ...(sales && { sales }) }, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการโหลดตัวเลขภาพรวม', { defaultStatus: 500 });
  }
}
