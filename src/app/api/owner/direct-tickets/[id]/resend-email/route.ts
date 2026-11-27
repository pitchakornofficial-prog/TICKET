import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import { assertSameOrigin } from '@/server/origin';
import { validateAndStoreRenderedTicketImage } from '@/server/rendered-ticket-image';
import { sendDirectIssuedTicketsEmail } from '@/server/ticket-delivery';
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

  let body: { renderedImages?: Array<{ ticketId?: string; dataUrl?: string }> } = {};
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await readBoundedJson(request, 12 * 1024 * 1024);
    } catch (error) {
      if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    }
  }

  const pool = auth.options.database as Pool;

  try {
    if (Array.isArray(body.renderedImages) && body.renderedImages.length > 0) {
      const orderTicketsRes = await pool.query<{ id: string }>(
        'SELECT id FROM tickets WHERE "orderId" = $1',
        [id],
      );
      const validIds = new Set(orderTicketsRes.rows.map((r) => r.id));
      for (const item of body.renderedImages.slice(0, 20)) {
        if (item?.ticketId && validIds.has(item.ticketId) && typeof item.dataUrl === 'string') {
          await validateAndStoreRenderedTicketImage(item.ticketId, item.dataUrl);
        }
      }
    }

    const result = await sendDirectIssuedTicketsEmail(pool, id);
    if (!result.success) {
      return Response.json({ ok: false, error: result.error || 'ส่งอีเมลไม่สำเร็จ' }, { status: 400 });
    }
    return Response.json({ ok: true, messageId: result.messageId }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งอีเมลซ้ำ', { defaultStatus: 500 });
  }
}
