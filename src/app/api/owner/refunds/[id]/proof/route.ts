import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { getRefundTransferProof } from '@/server/refunds';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await readActor(getAuth(), await headers());

    // AC-92: Only owner can download or access refund proof files
    if (actor?.role !== 'owner') {
      return new Response('Forbidden: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์ดูไฟล์หลักฐานการโอนเงิน (AC-92)', {
        status: 403,
      });
    }

    const result = await getRefundTransferProof(getDatabasePool(), {
      refundRequestId: id,
      actorRole: actor.role,
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
    const safeFilename = `refund-proof-${id.replace(/[^\w.-]/g, '_')}.${safeExtension}`;
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
