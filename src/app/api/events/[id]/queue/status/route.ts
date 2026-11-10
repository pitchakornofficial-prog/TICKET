import { NextResponse } from 'next/server';
import { getDatabasePool } from '@/server/database';
import { getOrCreateQueueEntry } from '@/server/queue';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    let pool = null;
    try {
      pool = getDatabasePool();
    } catch {
      // In-memory fallback if pool unavailable
    }

    if (!pool) {
      return NextResponse.json({
        allowed: true,
        queueNumber: 1,
        peopleAhead: 0,
        capacity: 200,
        activeCount: 1,
        status: 'active',
        token: token || 'qtok_fallback',
        estimatedSeconds: 0,
      });
    }

    const result = await getOrCreateQueueEntry(pool, id, token);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        allowed: true,
        queueNumber: 1,
        peopleAhead: 0,
        capacity: 200,
        activeCount: 1,
        status: 'active',
        token: 'qtok_fallback',
        estimatedSeconds: 0,
      },
      { status: 200 },
    );
  }
}
