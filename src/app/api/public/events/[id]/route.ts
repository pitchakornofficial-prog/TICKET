import { getDatabasePool } from '@/server/database';
import { getPublicEventWithApprovedSessions } from '@/server/events';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const pool = getDatabasePool();

  const event = await getPublicEventWithApprovedSessions(pool, id);
  if (!event) {
    return Response.json({ message: 'ไม่พบงานคอนเสิร์ตหรือยังไม่เปิดให้เข้าชม' }, { status: 404 });
  }

  return Response.json({ event }, { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } });
}
