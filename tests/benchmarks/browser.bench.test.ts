import { mkdir, writeFile } from 'node:fs/promises';
import { it, expect } from 'vitest';
import sharp from 'sharp';
import { benchmarkEnvironment, browserBenchmarks } from '../../scripts/benchmarks/browser.mjs';
import { GET } from '../../src/app/api/media/[...key]/route';
import { storage } from '../../src/server/storage';

it('measures real HTTP polling/images and native Chromium IndexedDB', async () => {
  const result = await browserBenchmarks(GET, storage);
  await mkdir('docs/benchmarks/results', { recursive: true });
  await writeFile('docs/benchmarks/results/browser.json', `${JSON.stringify({
    measuredAt: new Date().toISOString(), node: process.version, provenance: benchmarkEnvironment(), ...result,
  }, null, 2)}\n`);
});

it('does not serve a stale transformed poster after source-key replacement', async () => {
  const key = 'benchmark-overwritten-poster.jpg';
  const image = async (background: string) => sharp({ create: {
    width: 640, height: 800, channels: 3, background,
  } }).jpeg().toBuffer();
  const get = () => GET(new Request(`http://127.0.0.1/api/media/${key}?w=360&fm=webp`), {
    params: Promise.resolve({ key: [key] }),
  });
  try {
    await storage.put(key, await image('#ff0000'), 'image/jpeg', 'public');
    const before = Buffer.from(await (await get()).arrayBuffer());
    await storage.put(key, await image('#0000ff'), 'image/jpeg', 'public');
    const after = Buffer.from(await (await get()).arrayBuffer());
    expect(after.equals(before)).toBe(false);
    const pixel = await sharp(after).resize(1, 1).raw().toBuffer();
    expect(pixel[2]).toBeGreaterThan(200);
    expect(pixel[0]).toBeLessThan(30);
  } finally {
    await storage.delete(key);
  }
});
