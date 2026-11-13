import { describe, expect, it } from 'vitest';
import { storage } from '../../src/server/storage';

describe('Storage driver unit tests (ADR-0003)', () => {
  it('stores and retrieves binary data with content type', async () => {
    const key = 'test/poster.png';
    const payload = Buffer.from('test-image-data');
    const { url } = await storage.put(key, payload, 'image/png');
    expect(url).toContain(encodeURIComponent(key));

    const retrieved = await storage.get(key);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.contentType).toBe('image/png');
    expect(retrieved?.data.toString()).toBe('test-image-data');

    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });
});

import { vi } from 'vitest';
import { R2StorageDriver, readR2Config } from '../../src/server/storage-r2';
import { GET as getMediaRoute } from '../../src/app/api/media/[...key]/route';

describe('Media Streaming, R2 CDN URL, and Immutable ETag Caching', () => {
  it('reads R2_PUBLIC_BASE_URL and returns direct CDN URL for public assets only', async () => {
    const cfg = readR2Config({
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'bucket',
      R2_ENDPOINT: 'https://r2.example.com/',
      R2_PUBLIC_BASE_URL: 'https://cdn.example.com/',
    });
    expect(cfg?.publicBaseUrl).toBe('https://cdn.example.com');

    expect(cfg).not.toBeNull();
    if (!cfg) throw new Error('Expected cfg');

    const driver = new R2StorageDriver(cfg);
    const pubPresigned = await driver.createPresignedUploadUrl('posters/abc.webp', 'image/webp', 'public');
    expect(pubPresigned.publicUrl).toBe('https://cdn.example.com/posters/abc.webp');

    const privPresigned = await driver.createPresignedUploadUrl('proofs/xyz.pdf', 'application/pdf', 'private');
    expect(privPresigned.publicUrl).toBe('/api/media/proofs%2Fxyz.pdf');
  });

  it('streams R2 object via getStream without buffering arrayBuffer', async () => {
    const driver = new R2StorageDriver({
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'bucket',
      endpoint: 'https://r2.example.com',
    });

    const bodyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        controller.close();
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(bodyStream, {
        status: 200,
        headers: {
          'content-type': 'image/webp',
          'content-length': '4',
          etag: '"abc123"',
          'x-amz-meta-visibility': 'public',
        },
      }),
    );

    const item = await driver.getStream('posters/test.webp');
    expect(item).not.toBeNull();
    expect(item?.contentType).toBe('image/webp');
    expect(item?.visibility).toBe('public');
    expect(item?.contentLength).toBe(4);
    expect(item?.etag).toBe('"abc123"');
    const reader = item?.stream.getReader();
    const chunk = await reader?.read();
    expect(chunk?.value).toEqual(new Uint8Array([1, 2, 3, 4]));
    fetchSpy.mockRestore();
  });

  it('serves public media with immutable Cache-Control, ETag, and 304 Not Modified', async () => {
    const key = 'posters/bench-poster.webp';
    await storage.put(key, Buffer.from('webp-binary-data'), 'image/webp', 'public');

    const firstRes = await getMediaRoute(new Request('http://localhost/api/media/posters/bench-poster.webp'), {
      params: Promise.resolve({ key: ['posters', 'bench-poster.webp'] }),
    });
    expect(firstRes.status).toBe(200);
    expect(firstRes.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    const etag = firstRes.headers.get('ETag');
    expect(etag).toBeTruthy();

    const cachedRes = await getMediaRoute(
      new Request('http://localhost/api/media/posters/bench-poster.webp', {
        headers: { 'If-None-Match': etag || '' },
      }),
      { params: Promise.resolve({ key: ['posters', 'bench-poster.webp'] }) },
    );
    expect(cachedRes.status).toBe(304);
    expect(cachedRes.body).toBeNull();

    await storage.delete(key);
  });
});
