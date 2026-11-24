import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { storage } from '@/server/storage';
import { parseImageVariant, transformPublicImage } from '@/server/image-variants';
import { readBoundedStream, isPayloadTooLargeError } from '@/server/http-body';

export const runtime = 'nodejs';
const MAX_IMAGE_SOURCE_BYTES = 15 * 1024 * 1024;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const decodedSegments: string[] = [];
  for (const segment of key) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    // Existing storage URLs encode the whole key, including separators. Validate
    // every decoded component so those URLs remain usable without traversal.
    for (const part of decoded.split('/')) {
      if (!part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0')) {
        return new Response('Bad Request', { status: 400 });
      }
      decodedSegments.push(part);
    }
  }

  const fullKey = decodedSegments.join('/');
  if (
    !fullKey.startsWith('posters/') &&
    !fullKey.startsWith('proofs/') &&
    !fullKey.startsWith('ticket-fonts/')
  ) {
    return new Response('Forbidden', { status: 403 });
  }

  const streamItem = storage.getStream ? await storage.getStream(fullKey) : null;
  let bufferItem = streamItem ? null : await storage.get(fullKey);
  const item = streamItem ?? bufferItem;

  if (!item) {
    return new Response('Not found', { status: 404 });
  }

  // AC-92: Private storage boundary - only owner can access private items (proofs, slips)
  const isPrivate = item.visibility === 'private' || fullKey.startsWith('proofs/');
  if (isPrivate) {
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
  const SAFE_INLINE_FONT_TYPES = new Set(['font/woff2', 'font/woff', 'font/ttf', 'font/otf']);

  let effectiveContentType = item.contentType;
  let contentDisposition = `attachment; filename="${safeFilename}"`;

  if (SAFE_INLINE_IMAGE_TYPES.has(item.contentType) || SAFE_INLINE_FONT_TYPES.has(item.contentType)) {
    contentDisposition = `inline; filename="${safeFilename}"`;
  } else if (item.contentType === 'application/pdf') {
    contentDisposition = `attachment; filename="${safeFilename}"`;
  } else {
    // Fallback: dangerous or unrecognized types are forced to download as binary
    effectiveContentType = 'application/octet-stream';
    contentDisposition = `attachment; filename="${safeFilename}"`;
  }

  let etag =
    streamItem?.etag ||
    (bufferItem
      ? `"${createHash('sha256').update(bufferItem.data).digest('hex').slice(0, 16)}"`
      : undefined);

  const cacheControl =
    isPrivate
      ? 'private, no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';

  let variantData: Buffer | null = null;
  const variant = !isPrivate && SAFE_INLINE_IMAGE_TYPES.has(item.contentType) ? parseImageVariant(request.url) : null;
  if (variant) {
    // Originals keep the streaming path. Only requested public image variants
    // are buffered; proof bytes are never transformed or publicly cached.
    if (bufferItem && bufferItem.data.byteLength > MAX_IMAGE_SOURCE_BYTES) {
      return new Response('Payload too large', { status: 413 });
    }
    if (streamItem?.contentLength !== undefined && streamItem.contentLength > MAX_IMAGE_SOURCE_BYTES) {
      await streamItem.stream.cancel().catch(() => {});
      return new Response('Payload too large', { status: 413 });
    }
    let source: Buffer;
    try {
      source = bufferItem?.data ?? await readBoundedStream(streamItem?.stream ?? null, MAX_IMAGE_SOURCE_BYTES);
    } catch (error) {
      if (isPayloadTooLargeError(error)) return new Response('Payload too large', { status: 413 });
      throw error;
    }
    bufferItem = { data: source, contentType: item.contentType, visibility: item.visibility };
    try {
      const transformed = await transformPublicImage(fullKey, source, item.contentType, variant);
      variantData = transformed.data;
      effectiveContentType = transformed.contentType;
    } catch {
      variantData = source;
    }
    etag = `"${createHash('sha256').update(variantData).digest('hex').slice(0, 16)}"`;
  }

  if (!isPrivate && etag) {
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === '*')) {
      if (!variant) await streamItem?.stream.cancel().catch(() => {});
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
  const contentLength = variantData?.byteLength ?? streamItem?.contentLength ?? bufferItem?.data.byteLength;
  if (contentLength !== undefined) {
    responseHeaders['Content-Length'] = String(contentLength);
  }

  const body: BodyInit | null = variantData ? new Uint8Array(variantData) : streamItem
    ? streamItem.stream
    : bufferItem
      ? new Uint8Array(bufferItem.data)
      : null;

  return new Response(body, {
    status: 200,
    headers: responseHeaders,
  });
}
