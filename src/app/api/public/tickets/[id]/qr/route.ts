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

    let qrPayload = ticket?.qrPayload;
    let ticketCode = ticket?.ticketCode || 'SAMPLE-QR';

    if (!ticket) {
      if (id.startsWith('TKT-SAMPLE') || id.toLowerCase() === 'sample') {
        qrPayload = 'SAMPLE-QR-PAYLOAD-PREVIEW-01';
        ticketCode = 'TK-SAMPLE-8888-01';
      } else {
        return new Response('Ticket not found', { status: 404 });
      }
    }

    const pngBuffer = await generateTicketQrPngBuffer(qrPayload || ticketCode, { size: 400 });

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Disposition': `inline; filename="ticket-qr-${ticketCode}.png"`,
      },
    });
  } catch (error) {
    console.error('Failed to generate ticket QR PNG:', error);
    return new Response('Failed to generate QR image', { status: 500 });
  }
}
