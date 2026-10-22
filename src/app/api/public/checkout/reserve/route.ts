import { getDatabasePool } from '@/server/database';
import { createReservation, type CreateReservationInput } from '@/server/reservation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: Partial<CreateReservationInput> = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.verifiedToken || !body.eventId || !body.sessionId || !body.items) {
    return Response.json({ message: 'กรุณาระบุข้อมูลการกันบัตรให้ครบถ้วน' }, { status: 400 });
  }

  const pool = getDatabasePool();
  try {
    const reservation = await createReservation(pool, {
      verifiedToken: body.verifiedToken,
      eventId: body.eventId,
      sessionId: body.sessionId,
      items: body.items,
    });

    return Response.json(
      {
        message: 'กันบัตรสำเร็จ กรุณาชำระเงินภายใน 15 นาที',
        reservation,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการกันบัตร';
    const status = message.includes('OTP') ? 401 : 400;
    return Response.json({ message }, { status });
  }
}
