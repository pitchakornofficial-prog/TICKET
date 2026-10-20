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
