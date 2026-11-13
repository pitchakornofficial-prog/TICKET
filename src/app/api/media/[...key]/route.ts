import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { storage } from '@/server/storage';

export const runtime = 'nodejs';

const SAFE_INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_WIDTHS = [240, 320, 360, 480, 640, 800, 960, 1280, 1600] as const;
const MAX_VARIANT_CACHE_ENTRIES = 64;
const MAX_VARIANT_CACHE_BYTES = 24 * 1024 * 1024;

type ImageFormat = 'avif' | 'webp' | 'jpeg' | 'png';

interface CachedVariant {
  data: Uint8Array;
  contentType: string;
}

const variantCache = new Map<string, CachedVariant>();
let variantCacheBytes = 0;

function snapWidth(rawWidth: number): number {
  for (const bucket of ALLOWED_WIDTHS) {
    if (rawWidth <= bucket) return bucket;
  }
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

function getCachedVariant(cacheKey: string): CachedVariant | undefined {
  const hit = variantCache.get(cacheKey);
  if (!hit) return undefined;
  // Refresh LRU order
  variantCache.delete(cacheKey);
  variantCache.set(cacheKey, hit);
  return hit;
}

function setCachedVariant(cacheKey: string, value: CachedVariant): void {
  if (value.data.byteLength > MAX_VARIANT_CACHE_BYTES / 4) return;
  const existing = variantCache.get(cacheKey);
  if (existing) {
    variantCacheBytes -= existing.data.byteLength;
    variantCache.delete(cacheKey);
  }
  variantCache.set(cacheKey, value);
  variantCacheBytes += value.data.byteLength;

  while (
    variantCache.size > MAX_VARIANT_CACHE_ENTRIES ||
    variantCacheBytes > MAX_VARIANT_CACHE_BYTES
  ) {
    const oldestKey = variantCache.keys().next().value;
    if (!oldestKey) break;
    const evicted = variantCache.get(oldestKey);
    variantCache.delete(oldestKey);
    if (evicted) {
      variantCacheBytes -= evicted.data.byteLength;
    }
  }
}

function parseImageFormat(param: string | null): ImageFormat | null {
  if (!param) return null;
  const normalized = param.toLowerCase();
  if (normalized === 'avif' || normalized === 'webp' || normalized === 'png') {
    return normalized;
  }
  if (normalized === 'jpeg' || normalized === 'jpg') {
    return 'jpeg';
  }
  return null;
}

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

  let effectiveContentType = item.contentType;
  let contentDisposition = `attachment; filename="${safeFilename}"`;
  let responseBytes = new Uint8Array(item.data);

  if (SAFE_INLINE_IMAGE_TYPES.has(item.contentType)) {
    contentDisposition = `inline; filename="${safeFilename}"`;

    // Optional responsive resize/format negotiation for public raster images
    if (item.visibility === 'public') {
      const { searchParams } = new URL(request.url, 'http://localhost');
      const wParam = searchParams.get('w');
      const fmParam = parseImageFormat(searchParams.get('fm'));
      const rawWidth = wParam ? Number.parseInt(wParam, 10) : 0;
      const targetWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? snapWidth(rawWidth) : 0;

      if (targetWidth > 0 || fmParam) {
        const cacheKey = `${fullKey}:w=${targetWidth}:fm=${fmParam || 'orig'}`;
        const cached = getCachedVariant(cacheKey);
        if (cached) {
          responseBytes = new Uint8Array(cached.data);
          effectiveContentType = cached.contentType;
        } else {
          try {
            const sharpMod = await import('sharp');
            const sharp = sharpMod.default;
            let pipeline = sharp(item.data, { failOn: 'none' }).rotate();
            if (targetWidth > 0) {
              pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: true });
            }

            let outType = item.contentType;
            if (fmParam === 'avif') {
              pipeline = pipeline.avif({ quality: 65 });
              outType = 'image/avif';
            } else if (fmParam === 'webp') {
              pipeline = pipeline.webp({ quality: 80 });
              outType = 'image/webp';
            } else if (fmParam === 'jpeg') {
              pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
              outType = 'image/jpeg';
            } else if (fmParam === 'png') {
              pipeline = pipeline.png({ compressionLevel: 8 });
              outType = 'image/png';
            }

            const transformed = await pipeline.toBuffer();
            const outBytes = new Uint8Array(transformed);
            setCachedVariant(cacheKey, { data: outBytes, contentType: outType });
            responseBytes = outBytes;
            effectiveContentType = outType;
          } catch {
            // Fall back cleanly to original bytes when input is a synthetic/minimal test buffer
          }
        }
      }
    }
  } else if (item.contentType === 'application/pdf') {
    contentDisposition = `attachment; filename="${safeFilename}"`;
  } else {
    // Fallback: dangerous or unrecognized types are forced to download as binary
    effectiveContentType = 'application/octet-stream';
    contentDisposition = `attachment; filename="${safeFilename}"`;
  }

  return new Response(responseBytes, {
    status: 200,
    headers: {
      'Content-Type': effectiveContentType,
      'Content-Disposition': contentDisposition,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      Vary: 'Accept',
      'Cache-Control': item.visibility === 'private' ? 'private, no-cache' : 'public, max-age=3600',
    },
  });
}
