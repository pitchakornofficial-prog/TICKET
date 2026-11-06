import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { configureSpecialRefundWindow } from '@/server/events';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  try {
    const { id: sessionId } = await params;
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'owner') {
      return Response.json(
        { message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่สามารถกำหนดช่วงเวลาขอคืนเงินพิเศษได้ (AC-38)' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { specialRefundWindowStart, specialRefundWindowEnd } = body;

    const result = await configureSpecialRefundWindow(getDatabasePool(), {
      sessionId,
      ownerId: actor.id,
      specialRefundWindowStart,
      specialRefundWindowEnd,
    });

    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการกำหนดช่วงเวลาขอคืนเงินพิเศษ', {
      defaultStatus: 400,
      statusResolver: (msg) => msg.includes('ไม่อนุญาต') ? 403 : 400,
    });
  }
}
