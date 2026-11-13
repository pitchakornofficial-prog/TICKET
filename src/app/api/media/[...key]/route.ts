import { createHash } from 'node:crypto';
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

  const streamItem = storage.getStream ? await storage.getStream(fullKey) : null;
  const bufferItem = streamItem ? null : await storage.get(fullKey);
  const item = streamItem ?? bufferItem;

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
      await streamItem?.stream.cancel().catch(() => {});
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

  const etag =
    streamItem?.etag ||
    (bufferItem
      ? `"${createHash('sha256').update(bufferItem.data).digest('hex').slice(0, 16)}"`
      : undefined);

  const cacheControl =
    item.visibility === 'private'
      ? 'private, no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';

  if (item.visibility === 'public' && etag) {
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === '*')) {
      await streamItem?.stream.cancel().catch(() => {});
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': cacheControl,
        },
      });
    }
  }

  const responseHeaders: Record<string, string> = {
    'Content-Type': effectiveContentType,
    'Content-Disposition': contentDisposition,
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': cacheControl,
  };

  if (etag) {
    responseHeaders.ETag = etag;
  }
  const contentLength = streamItem?.contentLength ?? bufferItem?.data.byteLength;
  if (contentLength !== undefined) {
    responseHeaders['Content-Length'] = String(contentLength);
  }

  const body: BodyInit | null = streamItem
    ? streamItem.stream
    : bufferItem
      ? new Uint8Array(bufferItem.data)
      : null;

  return new Response(body, {
    status: 200,
    headers: responseHeaders,
  });
}
