import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import {
  getDirectIssuanceEventsOverview,
  listDirectTicketBatches,
} from '@/server/direct-tickets';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อน (401)' }, { status: 401 });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น (403)' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId') || undefined;
  const search = searchParams.get('search') || undefined;
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  try {
    const [options, { batches, total }] = await Promise.all([
      getDirectIssuanceEventsOverview(pool, session.user.id),
      listDirectTicketBatches(pool, {
        eventId,
        organizerId: session.user.id,
        search,
        limit,
        offset,
      }),
    ]);

    return Response.json(
      { ok: true, options, eventsOptions: options, batches, total },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
      },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการโหลดข้อมูลบัตรที่ดึงตรง', { defaultStatus: 500 });
  }
}
