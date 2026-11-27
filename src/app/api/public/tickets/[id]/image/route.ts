import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { getVerifiedGuestSession } from '@/server/guest-otp';
import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import {
  extractOrderRequestToken,
  resolveAuthorizedOrderReservation,
} from '@/server/order-access-token';
import { assertSameOrigin } from '@/server/origin';
import {
  getStoredRenderedTicketImage,
  validateAndStoreRenderedTicketImage,
} from '@/server/rendered-ticket-image';
import { getOrderReservation } from '@/server/reservation';
import { generateTicketCardPngBuffer } from '@/server/ticket-card-png';
import { getTicketById, type TicketDetail } from '@/server/tickets';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return new Response('Ticket ID is required', { status: 400 });
  }

  try {
    const pool = getDatabasePool();
    let ticket = await getTicketById(pool, id);
    let isSample = false;

    if (!ticket) {
      if (id.startsWith('TKT-SAMPLE') || id.toLowerCase() === 'sample') {
        isSample = true;
        ticket = {
          id,
          orderId: 'ORD-SAMPLE-9999',
          orderItemId: 'OI-SAMPLE-1',
          eventId: 'EVT-SAMPLE',
          sessionId: 'SES-SAMPLE',
          ticketTypeId: 'TT-SAMPLE',
          ticketTypeName: 'VIP FRONT ROW - ZONE A',
          ticketPrice: 3500,
          ticketCode: 'TK-SAMPLE-8888-01',
          qrPayload: 'SAMPLE-QR-PAYLOAD-PREVIEW-01',
          qrCodeUrl: 'data:image/svg+xml;utf8,<svg></svg>',
          status: 'valid',
          admissionStatus: 'outside',
          buyerName: 'พิชชากร คำพรม',
          buyerEmail: 'test@example.com',
          buyerPhone: '0812345678',
          sessionStartTime: new Date(Date.now() + 86400000 * 14).toISOString(),
          sessionEndTime: new Date(Date.now() + 86400000 * 14 + 10800000).toISOString(),
          location: 'อิมแพ็ค อารีน่า เมืองทองธานี',
          eventTitle: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
          eventPosterUrl: '',
          createdAt: new Date().toISOString(),
        } satisfies TicketDetail;
      } else {
        return new Response('Ticket not found', { status: 404 });
      }
    }

    const storedPng = isSample ? null : await getStoredRenderedTicketImage(ticket.id);
    const pngBuffer = storedPng ?? (await generateTicketCardPngBuffer(ticket, { width: 1000, height: 420, pool }));

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60, must-revalidate',
        'Content-Disposition': `inline; filename="ticket-pass-${ticket.ticketCode}.png"`,
      },
    });
  } catch (error) {
    console.error('Failed to generate ticket card PNG:', error);
    return new Response('Failed to generate ticket card image', { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id } = await params;
  if (!id) {
    return Response.json({ message: 'Ticket ID is required' }, { status: 400 });
  }

  const pool = getDatabasePool();
  const ticket = await getTicketById(pool, id);
  if (!ticket) {
    return Response.json({ message: 'Ticket not found' }, { status: 404 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  let authorized = session?.user.role === 'owner';

  if (!authorized && session?.user.role === 'organizer') {
    const evRes = await pool.query<{ organizerId: string }>(
      'SELECT "organizerId" FROM events WHERE id = $1 LIMIT 1',
      [ticket.eventId],
    );
    authorized = evRes.rows[0]?.organizerId === session.user.id;
  }

  if (!authorized) {
    const token = extractOrderRequestToken(request);
    const authResult = await resolveAuthorizedOrderReservation({
      orderId: ticket.orderId,
      token,
      unauthorizedMessage: 'กรุณายืนยันตัวตนผ่าน OTP ก่อนอัปโหลดรูปบัตร',
      forbiddenMessage: 'ท่านไม่มีสิทธิ์ในการอัปโหลดรูปบัตรของคำสั่งซื้อนี้',
      getOrderReservation: (orderId) => getOrderReservation(pool, orderId),
      getVerifiedGuestSession: (t) =>
        getVerifiedGuestSession(pool, t, new Date(), ['checkout', 'order_lookup']),
    });
    if (!authResult.ok) {
      return authResult.response;
    }
  }

  let body: { dataUrl?: unknown } = {};
  try {
    body = await readBoundedJson(request, 3 * 1024 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.dataUrl !== 'string') {
    return Response.json({ message: 'dataUrl is required' }, { status: 400 });
  }

  try {
    await validateAndStoreRenderedTicketImage(ticket.id, body.dataUrl);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : 'Invalid rendered ticket image' },
      { status: 400 },
    );
  }
}
