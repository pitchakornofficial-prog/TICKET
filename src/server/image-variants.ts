import { createHash } from 'node:crypto';
import sharp from 'sharp';

const WIDTHS = [240, 320, 360, 480, 640, 800, 960, 1280, 1600];
const MAX_ENTRIES = 64;
const MAX_BYTES = 24 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_TRANSFORMS = 2;
export const MAX_QUEUED_IMAGE_TRANSFORMS = 4;

export class ImageTransformCapacityError extends Error {
  constructor() {
    super('IMAGE_TRANSFORM_CAPACITY_EXCEEDED');
    this.name = 'ImageTransformCapacityError';
  }
}

interface Variant { data: Buffer; contentType: string }
const cache = new Map<string, Variant>();
const pending = new Map<string, Promise<Variant>>();
let cachedBytes = 0;
let activeTransforms = 0;
const transformQueue: Array<() => void> = [];

async function acquireTransformSlot(): Promise<void> {
  if (activeTransforms < MAX_IMAGE_TRANSFORMS) {
    activeTransforms += 1;
    return;
  }
  if (transformQueue.length >= MAX_QUEUED_IMAGE_TRANSFORMS) {
    throw new ImageTransformCapacityError();
  }
  await new Promise<void>(resolve => transformQueue.push(resolve));
}

function releaseTransformSlot(): void {
  const next = transformQueue.shift();
  if (next) next();
  else activeTransforms -= 1;
}

async function withTransformSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquireTransformSlot();
  try {
    return await work();
  } finally {
    releaseTransformSlot();
  }
}

export function parseImageVariant(url: string) {
  const params = new URL(url).searchParams;
  const requested = Number.parseInt(params.get('w') || '', 10);
  const width = Number.isFinite(requested) && requested > 0
    ? WIDTHS.find(value => value >= requested) ?? 1600 : 0;
  const rawFormat = params.get('fm')?.toLowerCase();
  const format = rawFormat === 'jpg' ? 'jpeg' : rawFormat;
  const validFormat = format === 'avif' || format === 'webp' || format === 'jpeg' || format === 'png' ? format : null;
  return width || validFormat ? { width, format: validFormat } : null;
}

export async function transformPublicImage(
  key: string,
  source: Buffer,
  contentType: string,
  options: NonNullable<ReturnType<typeof parseImageVariant>>,
): Promise<Variant> {
  const digest = createHash('sha256').update(source).digest('hex');
  const cacheKey = `${key}:${digest}:${contentType}:${options.width}:${options.format}`;
  const hit = cache.get(cacheKey);
  if (hit) {
    cache.delete(cacheKey);
    cache.set(cacheKey, hit);
    return hit;
  }
  const active = pending.get(cacheKey);
  if (active) return active;
  const work = withTransformSlot(async () => {
    let pipeline = sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate();
    if (options.width) pipeline = pipeline.resize({ width: options.width, withoutEnlargement: true });
    let outputType = contentType;
    if (options.format === 'avif') { pipeline = pipeline.avif({ quality: 65 }); outputType = 'image/avif'; }
    if (options.format === 'webp') { pipeline = pipeline.webp({ quality: 80 }); outputType = 'image/webp'; }
    if (options.format === 'jpeg') { pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true }); outputType = 'image/jpeg'; }
    if (options.format === 'png') { pipeline = pipeline.png({ compressionLevel: 8 }); outputType = 'image/png'; }
    const data = await pipeline.toBuffer();
    const value = { data, contentType: outputType };
    if (data.byteLength <= MAX_BYTES / 4) {
      cachedBytes -= cache.get(cacheKey)?.data.byteLength ?? 0;
      cache.delete(cacheKey);
      cache.set(cacheKey, value);
      cachedBytes += data.byteLength;
      while (cache.size > MAX_ENTRIES || cachedBytes > MAX_BYTES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cachedBytes -= cache.get(oldest)?.data.byteLength ?? 0;
        cache.delete(oldest);
      }
    }
    return value;
  });
  if (pending.size < MAX_ENTRIES) pending.set(cacheKey, work);
  try { return await work; }
  finally { if (pending.get(cacheKey) === work) pending.delete(cacheKey); }
}
