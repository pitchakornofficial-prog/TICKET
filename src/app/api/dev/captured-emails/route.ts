import { getCapturedEmails, clearCapturedEmails } from '@/server/email';

export const runtime = 'nodejs';

function isLoopbackRequest(request: Request): boolean {
  try {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    const hostHeader = (request.headers.get('host') || '').split(':')[0].toLowerCase();

    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]';

    const isLocalHeader =
      hostHeader === 'localhost' ||
      hostHeader === '127.0.0.1' ||
      hostHeader === '::1' ||
      hostHeader === '[::1]';

    if (!isLocalHost && !isLocalHeader) {
      return false;
    }

    // Check for reverse proxy client IP headers
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      const clientIp = forwardedFor.split(',')[0].trim().toLowerCase();
      if (
        clientIp &&
        clientIp !== '127.0.0.1' &&
        clientIp !== '::1' &&
        clientIp !== 'localhost'
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function isAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (process.env.ENABLE_DEV_MAIL_PREVIEW !== 'true') {
    return false;
  }
  if (!isLoopbackRequest(request)) {
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response(null, { status: 404 });
  }

  const emails = getCapturedEmails();
  return Response.json(
    { emails },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return new Response(null, { status: 404 });
  }

  clearCapturedEmails();
  return Response.json(
    { message: 'ล้างรายการอีเมลจำลองเรียบร้อยแล้ว' },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
