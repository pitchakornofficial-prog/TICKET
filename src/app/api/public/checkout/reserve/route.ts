import { createSafeErrorResponse } from '@/server/api-error';
import { getDatabasePool } from '@/server/database';
import { isRealPgPool } from '@/server/pg-pool-utils';
import { completeQueueEntry, verifyQueueAccess } from '@/server/queue';
import { createReservation, QueueLockedError, type CreateReservationInput } from '@/server/reservation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: Partial<CreateReservationInput> & { queueToken?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.verifiedToken || !body.eventId || !body.sessionId || !body.items) {
    return Response.json({ message: 'กรุณาระบุข้อมูลการกันบัตรให้ครบถ้วน' }, { status: 400 });
  }

  const rawQueueToken =
    typeof body.queueToken === 'string'
      ? body.queueToken
      : request.headers.get('x-queue-token') || '';
  const queueToken = rawQueueToken.trim() || null;

  const pool = getDatabasePool();
  const useFastPg = isRealPgPool(pool);
  try {
    if (!useFastPg) {
      const queueAllowed = await verifyQueueAccess(pool, body.eventId, queueToken);
      if (!queueAllowed) {
        return Response.json(
          {
            message: 'ขณะนี้มีผู้ใช้งานเต็มจำนวน 200 คิวแล้ว กรุณารอตามลำดับคิวในห้องรอคิว',
            code: 'QUEUE_LOCKED',
          },
          { status: 429 },
        );
      }
    }

    const reservation = await createReservation(
      pool,
      {
        verifiedToken: body.verifiedToken,
        eventId: body.eventId,
        sessionId: body.sessionId,
        items: body.items,
      },
      new Date(),
      useFastPg ? { queueToken, enforceQueue: true } : undefined,
    );

    if (!useFastPg && queueToken) {
      await completeQueueEntry(pool, body.eventId, queueToken);
    }

    return Response.json(
      {
        message: 'กันบัตรสำเร็จ กรุณาชำระเงินภายใน 15 นาที',
        reservation,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (error instanceof QueueLockedError) {
      return Response.json(
        {
          message: error.message,
          code: 'QUEUE_LOCKED',
        },
        { status: 429 },
      );
    }
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการกันบัตร', {
      defaultStatus: 400,
      statusResolver: (msg) => (msg.includes('OTP') ? 401 : 400),
    });
  }
}
