import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { safeRevalidateTag } from '@/server/cache';
import { revokeDirectTickets } from '@/server/direct-tickets';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id } = await props.params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น (403)' }, { status: 403 });
  }

  let body: { ticketIds?: string[]; reason?: string } = {};
  try {
    body = await readBoundedJson(request, 32 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
  }

  const pool = auth.options.database as Pool;

  try {
    const result = await revokeDirectTickets(pool, {
      orderId: id,
      ticketIds: body.ticketIds,
      revokedByUserId: session.user.id,
      reason: body.reason,
    });

    safeRevalidateTag('events');

    return Response.json(
      {
        ok: true,
        revokedCount: result.revokedCount,
        releasedTicketCodes: result.releasedTicketCodes,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการยกเลิกบัตร', { defaultStatus: 400 });
  }
}
