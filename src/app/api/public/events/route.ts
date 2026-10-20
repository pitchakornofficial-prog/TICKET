import { getDatabasePool } from '@/server/database';
import { listPublicEvents } from '@/server/events';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || undefined;

  const pool = getDatabasePool();
  const events = await listPublicEvents(pool, q);

  return Response.json({ events }, { status: 200, headers: { 'Cache-Control': 'public, max-age=30' } });
}
