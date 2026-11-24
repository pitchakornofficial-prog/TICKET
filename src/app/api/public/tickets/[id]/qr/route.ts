import { getDatabasePool } from '@/server/database';
import { generateTicketQrPngBuffer } from '@/server/ticket-qr-png';
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

    const pngBuffer = await generateTicketQrPngBuffer(ticket.qrPayload, { size: 400 });

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Disposition': `inline; filename="ticket-qr-${ticket.ticketCode}.png"`,
      },
    });
  } catch (error) {
    console.error('Failed to generate ticket QR PNG:', error);
    return new Response('Failed to generate QR image', { status: 500 });
  }
}
