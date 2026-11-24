import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { safeRevalidateTag } from '@/server/cache';
import {
  getDirectIssuanceEventsOverview,
  issueDirectTickets,
  listDirectTicketBatches,
  type IssueDirectTicketsInput,
} from '@/server/direct-tickets';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น (403)' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId') || undefined;
  const search = searchParams.get('search') || undefined;
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  try {
    const [options, { batches, total }] = await Promise.all([
      getDirectIssuanceEventsOverview(pool),
      listDirectTicketBatches(pool, { eventId, search, limit, offset }),
    ]);

    return Response.json(
      { ok: true, options, eventsOptions: options, batches, total },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
      },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงข้อมูลรายการออกบัตรตรง', { defaultStatus: 500 });
  }
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น (403)' }, { status: 403 });
  }

  let body: Partial<IssueDirectTicketsInput> = {};
  try {
    body = await readBoundedJson(request, 64 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return Response.json({ message: 'รูปแบบข้อมูลไม่ถูกต้อง (400)' }, { status: 400 });
  }

  if (!body.eventId || !body.sessionId || !body.items || body.items.length === 0) {
    return Response.json({ message: 'กรุณาระบุข้อมูลคอนเสิร์ต รอบ และประเภทบัตรให้ครบถ้วน (400)' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;

  try {
    const result = await issueDirectTickets(pool, {
      eventId: body.eventId,
      sessionId: body.sessionId,
      items: body.items,
      recipientMode: body.recipientMode || 'organizer',
      recipientName: body.recipientName,
      recipientEmail: body.recipientEmail,
      recipientPhone: body.recipientPhone,
      referenceNote: body.referenceNote,
      priceDisplayMode: body.priceDisplayMode || 'face_value',
      sendEmail: body.sendEmail !== false,
      issuedByUserId: session.user.id,
    });

    safeRevalidateTag('events');

    return Response.json(
      {
        ok: true,
        orderId: result.orderId,
        totalTickets: result.totalTickets,
        emailSent: result.emailSent,
        emailError: result.emailError,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการออกบัตรตรง', { defaultStatus: 400 });
  }
}
