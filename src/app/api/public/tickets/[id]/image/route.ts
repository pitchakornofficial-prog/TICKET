import { getDatabasePool } from '@/server/database';
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

    if (!ticket) {
      if (id.startsWith('TKT-SAMPLE') || id.toLowerCase() === 'sample') {
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

    const pngBuffer = await generateTicketCardPngBuffer(ticket, { width: 1000, height: 420, pool });

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Disposition': `inline; filename="ticket-pass-${ticket.ticketCode}.png"`,
      },
    });
  } catch (error) {
    console.error('Failed to generate ticket card PNG:', error);
    return new Response('Failed to generate ticket card image', { status: 500 });
  }
}
