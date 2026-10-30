// ADR-0003: Cloudflare R2 สำหรับเก็บภาพและหลักฐาน
// Local substitute ที่ปลอดภัย ใช้ in-memory store หรือ loopback serving โดยไม่ใช้ instance-local persistent disk เป็น shared production storage

import { R2StorageDriver, readR2Config } from './storage-r2';

export interface StorageItem {
  data: Buffer;
  contentType: string;
  visibility: 'public' | 'private';
}

export interface StorageDriver {
  put(key: string, data: Uint8Array | Buffer, contentType: string, visibility?: 'public' | 'private'): Promise<{ url: string; key: string }>;
  get(key: string): Promise<StorageItem | null>;
  delete(key: string): Promise<void>;
}

class MemoryStorageDouble implements StorageDriver {
  private files = new Map<string, { data: Buffer; contentType: string; visibility: 'public' | 'private' }>();

  async put(key: string, data: Uint8Array | Buffer, contentType: string, visibility: 'public' | 'private' = 'public'): Promise<{ url: string; key: string }> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.files.set(key, { data: buf, contentType, visibility });
    // In local development / testing, assets can be read via /api/media/[...key]
    const url = `/api/media/${encodeURIComponent(key)}`;
    return { url, key };
  }

  async get(key: string): Promise<StorageItem | null> {
    const item = this.files.get(key);
    if (!item) return null;
    return { data: item.data, contentType: item.contentType, visibility: item.visibility };
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }

  clear(): void {
    this.files.clear();
  }
}

const memoryStorage = new MemoryStorageDouble();
let r2Storage: StorageDriver | null = null;

function resolveDriver(): StorageDriver {
  // test runner ใช้ double เสมอ เพื่อไม่ยิงไป bucket จริง
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return memoryStorage;
  const config = readR2Config();
  if (config) {
    r2Storage ??= new R2StorageDriver(config);
    return r2Storage;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('R2 storage is not configured (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT)');
  }
  return memoryStorage;
}

export const storage: StorageDriver & { clear(): void } = {
  put: (key, data, contentType, visibility) => resolveDriver().put(key, data, contentType, visibility),
  get: (key) => resolveDriver().get(key),
  delete: (key) => resolveDriver().delete(key),
  clear: () => memoryStorage.clear(),
};
