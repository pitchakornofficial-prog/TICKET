import { getAuth } from '@/server/auth';
import { getOrganizerAnalytics } from '@/server/organizer-analytics';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return Response.json(
      { message: 'กรุณาเข้าสู่ระบบก่อนเข้าถึงข้อมูลแดชบอร์ด (401)' },
      { status: 401 },
    );
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น (403)' },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');
  const pool = auth.options.database as Pool;

  try {
    const analytics = await getOrganizerAnalytics(pool, session.user.id, eventId);
    return Response.json(analytics, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูลสถิติภาพรวม';
    return Response.json({ message }, { status: 500 });
  }
}
