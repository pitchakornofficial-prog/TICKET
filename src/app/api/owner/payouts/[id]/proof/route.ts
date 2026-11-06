import { getAuth } from '@/server/auth';
import { getPayoutProof } from '@/server/reports';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return new Response('Unauthorized: กรุณาเข้าสู่ระบบก่อนเข้าถึงไฟล์หลักฐาน', {
      status: 401,
    });
  }

  if (session.user.role !== 'owner') {
    return new Response('Forbidden: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์ดูไฟล์หลักฐานการโอนเงิน (AC-92)', {
      status: 403,
    });
  }

  const { id: payoutId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const result = await getPayoutProof(pool, {
      payoutId,
      actorRole: session.user.role,
    });

    if (!result.success || !result.data) {
      const status = result.code === 'FORBIDDEN' ? 403 : 404;
      return new Response(result.error || 'Not found', { status });
    }

    const contentType = result.contentType || 'application/octet-stream';
    const SAFE_INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const safeExtension = contentType === 'application/pdf'
      ? 'pdf'
      : contentType === 'image/jpeg'
        ? 'jpg'
        : contentType === 'image/webp'
          ? 'webp'
          : contentType === 'image/png'
            ? 'png'
            : 'bin';
    const safeFilename = `payout-proof-${payoutId.replace(/[^\w.-]/g, '_')}.${safeExtension}`;
    const contentDisposition = SAFE_INLINE_IMAGE_TYPES.has(contentType)
      ? `inline; filename="${safeFilename}"`
      : `attachment; filename="${safeFilename}"`;

    return new Response(new Uint8Array(result.data), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return new Response('Internal server error', { status: 500 });
  }
}
