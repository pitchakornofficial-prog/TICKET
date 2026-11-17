import { NextResponse } from 'next/server';
import { getDatabasePool } from '@/server/database';
import { extractClientIp } from '@/server/guest-otp';
import { getOrCreateQueueEntry, QueueRateLimitedError, QUEUE_CAPACITY } from '@/server/queue';
import { createQueueSessionId, readQueueCookie, serializeQueueCookie } from '@/server/queue-cookie';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieIdentity = readQueueCookie(request, id);
  const sessionId = cookieIdentity?.sessionId || createQueueSessionId();

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
      const token = cookieIdentity?.entryToken || 'qtok_fallback';
      const response = NextResponse.json({
        allowed: true,
        queueNumber: 1,
        peopleAhead: 0,
        capacity: QUEUE_CAPACITY,
        activeCount: 1,
        status: 'active',
        estimatedSeconds: 0,
      }, { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } });
      response.headers.append('Set-Cookie', serializeQueueCookie(id, token, sessionId));
      return response;
    }

    const result = await getOrCreateQueueEntry(pool, id, cookieIdentity?.entryToken, {
      sessionId,
      clientIp: extractClientIp(request),
    });
    const response = NextResponse.json({
      allowed: result.allowed,
      queueNumber: result.queueNumber,
      peopleAhead: result.peopleAhead,
      capacity: result.capacity,
      activeCount: result.activeCount,
      status: result.status,
      estimatedSeconds: result.estimatedSeconds,
    }, { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } });
    response.headers.append('Set-Cookie', serializeQueueCookie(id, result.token, sessionId));
    return response;
  } catch (error) {
    if (error instanceof QueueRateLimitedError) {
      const response = NextResponse.json(
        { message: error.message, code: 'QUEUE_RATE_LIMITED' },
        { status: 429, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
      );
      response.headers.append('Set-Cookie', serializeQueueCookie(id, '', sessionId));
      return response;
    }

    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          allowed: false,
          queueNumber: 0,
          peopleAhead: 1,
          capacity: QUEUE_CAPACITY,
          activeCount: QUEUE_CAPACITY,
          status: 'waiting',
          estimatedSeconds: 10,
          message: 'ระบบคิวกำลังทำงานหนัก กรุณารอสักครู่',
        },
        { status: 503, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
      );
    }

    const token = cookieIdentity?.entryToken || `qtok_fallback_${sessionId}`;
    const response = NextResponse.json(
      {
        allowed: true,
        queueNumber: 1,
        peopleAhead: 0,
        capacity: QUEUE_CAPACITY,
        activeCount: 1,
        status: 'active',
        estimatedSeconds: 0,
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
    response.headers.append('Set-Cookie', serializeQueueCookie(id, token, sessionId));
    return response;
  }
}
