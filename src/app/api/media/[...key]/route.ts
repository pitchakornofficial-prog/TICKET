import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { storage } from '@/server/storage';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const fullKey = key.map(decodeURIComponent).join('/');
  const item = await storage.get(fullKey);
  if (!item) {
    return new Response('Not found', { status: 404 });
  }

  // AC-92: Private storage boundary - only owner can access private items (proofs, slips)
  if (item.visibility === 'private') {
    let reqHeaders: HeadersInit = request.headers;
    try {
      reqHeaders = await headers();
    } catch {
      reqHeaders = request.headers;
    }
    const actor = await readActor(getAuth(), reqHeaders);
    if (actor?.role !== 'owner') {
      return new Response('Forbidden: Access restricted to owner only', { status: 403 });
    }
  }

  const safeFilename = (fullKey.split('/').pop() || 'download').replace(/[^\w.-]/g, '_');
  const SAFE_INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

  let effectiveContentType = item.contentType;
  let contentDisposition = `attachment; filename="${safeFilename}"`;

  if (SAFE_INLINE_IMAGE_TYPES.has(item.contentType)) {
    contentDisposition = `inline; filename="${safeFilename}"`;
  } else if (item.contentType === 'application/pdf') {
    contentDisposition = `attachment; filename="${safeFilename}"`;
  } else {
    // Fallback: dangerous or unrecognized types are forced to download as binary
    effectiveContentType = 'application/octet-stream';
    contentDisposition = `attachment; filename="${safeFilename}"`;
  }

  return new Response(new Uint8Array(item.data), {
    status: 200,
    headers: {
      'Content-Type': effectiveContentType,
      'Content-Disposition': contentDisposition,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cache-Control': item.visibility === 'private' ? 'private, no-cache' : 'public, max-age=3600',
    },
  });
}
