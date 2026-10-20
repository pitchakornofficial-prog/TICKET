import { getAuth } from '@/server/auth';
import { getPublicEventWithApprovedSessions } from '@/server/events';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = getAuth();
  const pool = auth.options.database as Pool;

  const event = await getPublicEventWithApprovedSessions(pool, id);
  if (!event) {
    return Response.json({ message: 'ไม่พบงานคอนเสิร์ตหรือยังไม่เปิดให้เข้าชม' }, { status: 404 });
  }

  return Response.json({ event }, { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } });
}
