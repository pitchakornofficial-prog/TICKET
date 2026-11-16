import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { GET } from '../../src/app/api/media/[...key]/route';
import { storage } from '../../src/server/storage';

let role = 'owner';
vi.mock('@/server/auth', () => ({
  getAuth: () => ({}), readActor: async () => ({ id: 'test-owner', role }),
}));
afterEach(() => { vi.restoreAllMocks(); role = 'owner'; storage.clear(); });
const source = () => sharp({ create: { width: 640, height: 800, channels: 3, background: '#3366cc' } }).jpeg().toBuffer();
const get = (key: string[], query = '', headers?: HeadersInit) => GET(
  new Request(`http://localhost/api/media/${key.join('/')}?${query}`, { headers }),
  { params: Promise.resolve({ key }) },
);

it('serves existing encoded-key URLs with representation-specific conditional ETags', async () => {
  const image = await source();
  await storage.put('posters/variants.jpg', image, 'image/jpeg', 'public');
  const original = await get(['posters%2Fvariants.jpg']);
  expect(original.status).toBe(200);
  expect(Buffer.from(await original.arrayBuffer()).equals(image)).toBe(true);
  const webp = await get(['posters', 'variants.jpg'], 'w=360&fm=webp');
  expect(webp.headers.get('content-type')).toBe('image/webp');
  expect((await sharp(Buffer.from(await webp.arrayBuffer())).metadata()).width).toBe(360);
  const webpTag = webp.headers.get('etag') ?? '';
  expect(webpTag).not.toBe(original.headers.get('etag'));
  const unchanged = await get(['posters', 'variants.jpg'], 'w=360&fm=webp', { 'If-None-Match': webpTag });
  expect(unchanged.status).toBe(304);
  const avif = await get(['posters', 'variants.jpg'], 'w=360&fm=avif', { 'If-None-Match': webpTag });
  expect(avif.status).toBe(200);
  expect(avif.headers.get('content-type')).toBe('image/avif');
  expect(avif.headers.get('etag')).not.toBe(webpTag);
  expect((await sharp(Buffer.from(await avif.arrayBuffer())).metadata()).compression).toBe('av1');
});

it('transforms a requested public stream while preserving originals and source privacy', async () => {
  const data = await source();
  const getBuffer = vi.spyOn(storage, 'get');
  vi.spyOn(storage, 'getStream').mockImplementation(async () => ({
    stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(data)); controller.close(); } }),
    contentType: 'image/jpeg', visibility: 'public', etag: '"source-etag"', contentLength: data.length,
  }));
  const original = await get(['posters', 'stream.jpg']);
  expect(original.headers.get('etag')).toBe('"source-etag"');
  expect(Buffer.from(await original.arrayBuffer()).equals(data)).toBe(true);
  const resized = await get(['posters', 'stream.jpg'], 'w=240&fm=webp');
  const bytes = Buffer.from(await resized.arrayBuffer());
  expect(Number(resized.headers.get('content-length'))).toBe(bytes.length);
  expect((await sharp(bytes).metadata()).width).toBe(240);
  expect(getBuffer).not.toHaveBeenCalled();
});

it('keeps proofs private and untransformed even if their stored visibility is incorrect', async () => {
  const image = await source();
  await storage.put('proofs/owner.jpg', image, 'image/jpeg', 'public');
  const owner = await get(['proofs', 'owner.jpg'], 'w=240&fm=webp');
  expect(owner.headers.get('cache-control')).toContain('no-store');
  expect(owner.headers.get('content-type')).toBe('image/jpeg');
  expect(Buffer.from(await owner.arrayBuffer()).equals(image)).toBe(true);
  role = 'organizer';
  expect((await get(['proofs%2Fowner.jpg'], 'w=240&fm=webp')).status).toBe(403);
  expect((await get(['posters', '..%2Fproofs%2Fowner.jpg'])).status).toBe(400);
});
