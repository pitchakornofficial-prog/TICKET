import { NextResponse } from 'next/server';
import { getDatabasePool } from '@/server/database';
import { getOrCreateQueueEntry, QUEUE_CAPACITY } from '@/server/queue';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  try {
    let pool = null;
    try {
      pool = getDatabasePool();
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }

    if (!pool) {
      return NextResponse.json({
        allowed: true,
        queueNumber: 1,
        peopleAhead: 0,
        capacity: QUEUE_CAPACITY,
        activeCount: 1,
        status: 'active',
        token: token || 'qtok_fallback',
        estimatedSeconds: 0,
      });
    }

    const result = await getOrCreateQueueEntry(pool, id, token);
    return NextResponse.json(result);
  } catch {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          allowed: false,
          queueNumber: 0,
          peopleAhead: 1,
          capacity: QUEUE_CAPACITY,
          activeCount: QUEUE_CAPACITY,
          status: 'waiting',
          token: token || '',
          estimatedSeconds: 10,
          message: 'ระบบคิวกำลังทำงานหนัก กรุณารอสักครู่',
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        allowed: true,
        queueNumber: 1,
        peopleAhead: 0,
        capacity: QUEUE_CAPACITY,
        activeCount: 1,
        status: 'active',
        token: token || 'qtok_fallback',
        estimatedSeconds: 0,
      },
      { status: 200 },
    );
  }
}
