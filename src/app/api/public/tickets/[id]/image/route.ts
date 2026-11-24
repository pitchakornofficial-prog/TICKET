import { getDatabasePool } from '@/server/database';
import { generateTicketCardPngBuffer } from '@/server/ticket-card-png';
import { getTicketById } from '@/server/tickets';

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
    const ticket = await getTicketById(pool, id);

    if (!ticket) {
      return new Response('Ticket not found', { status: 404 });
    }

    const pngBuffer = await generateTicketCardPngBuffer(ticket, { width: 1000, height: 420 });

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
