// ADR-0003: Cloudflare R2 สำหรับเก็บภาพและหลักฐาน
// Local substitute ที่ปลอดภัย ใช้ in-memory store หรือ loopback serving โดยไม่ใช้ instance-local persistent disk เป็น shared production storage

import { randomUUID } from 'node:crypto';
import { R2StorageDriver, readR2Config } from './storage-r2.ts';

export interface StorageItem {
  data: Buffer;
  contentType: string;
  visibility: 'public' | 'private';
}

export interface StorageStreamItem {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  visibility: 'public' | 'private';
  contentLength?: number;
  etag?: string;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  maxFileSizeBytes: number;
  expiresInSeconds: number;
}

export interface StorageDriver {
  put(
    key: string,
    data: Uint8Array | Buffer,
    contentType: string,
    visibility?: 'public' | 'private',
  ): Promise<{ url: string; key: string }>;
  get(key: string): Promise<StorageItem | null>;
  getStream?(key: string): Promise<StorageStreamItem | null>;
  delete(key: string): Promise<void>;
  createPresignedUploadUrl(
    key: string,
    contentType: string,
    visibility?: 'public' | 'private',
    maxFileSizeBytes?: number,
    expiresInSeconds?: number,
  ): Promise<PresignedUploadResult>;
}

export class MemoryStorageDouble implements StorageDriver {
  private files = new Map<
    string,
    { data: Buffer; contentType: string; visibility: 'public' | 'private' }
  >();
  private presignedTokens = new Map<
    string,
    {
      key: string;
      contentType: string;
      visibility: 'public' | 'private';
      maxFileSizeBytes: number;
      expiresAt: number;
    }
  >();

  async put(
    key: string,
    data: Uint8Array | Buffer,
    contentType: string,
    visibility: 'public' | 'private' = 'public',
  ): Promise<{ url: string; key: string }> {
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

  async createPresignedUploadUrl(
    key: string,
    contentType: string,
    visibility: 'public' | 'private' = 'public',
    maxFileSizeBytes = 15 * 1024 * 1024,
    expiresInSeconds = 900,
  ): Promise<PresignedUploadResult> {
    const token = randomUUID();
    this.presignedTokens.set(token, {
      key,
      contentType,
      visibility,
      maxFileSizeBytes,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    });
    const uploadUrl = `/api/media/direct-upload?key=${encodeURIComponent(key)}&token=${token}`;
    const publicUrl = `/api/media/${encodeURIComponent(key)}`;
    return {
      uploadUrl,
      key,
      publicUrl,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(maxFileSizeBytes),
        'x-amz-meta-visibility': visibility,
      },
      maxFileSizeBytes,
      expiresInSeconds,
    };
  }

  verifyPresignedToken(
    token: string,
    key: string,
  ): {
    valid: boolean;
    contentType?: string;
    visibility?: 'public' | 'private';
    maxFileSizeBytes?: number;
  } {
    const entry = this.presignedTokens.get(token);
    if (!entry) return { valid: false };
    if (entry.expiresAt < Date.now()) {
      this.presignedTokens.delete(token);
      return { valid: false };
    }
    if (entry.key !== key) return { valid: false };
    return {
      valid: true,
      contentType: entry.contentType,
      visibility: entry.visibility,
      maxFileSizeBytes: entry.maxFileSizeBytes,
    };
  }

  consumePresignedToken(token: string): void {
    this.presignedTokens.delete(token);
  }

  clear(): void {
    this.files.clear();
    this.presignedTokens.clear();
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
    throw new Error(
      'R2 storage is not configured (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT)',
    );
  }
  return memoryStorage;
}

export const storage: StorageDriver & {
  clear(): void;
  verifyPresignedToken?(
    token: string,
    key: string,
  ): {
    valid: boolean;
    contentType?: string;
    visibility?: 'public' | 'private';
    maxFileSizeBytes?: number;
  };
  consumePresignedToken?(token: string): void;
} = {
  put: (key, data, contentType, visibility) =>
    resolveDriver().put(key, data, contentType, visibility),
  get: (key) => resolveDriver().get(key),
  getStream: (key) => {
    const driver = resolveDriver();
    return driver.getStream ? driver.getStream(key) : Promise.resolve(null);
  },
  delete: (key) => resolveDriver().delete(key),
  createPresignedUploadUrl: (key, contentType, visibility, maxFileSizeBytes, expiresInSeconds) =>
    resolveDriver().createPresignedUploadUrl(
      key,
      contentType,
      visibility,
      maxFileSizeBytes,
      expiresInSeconds,
    ),
  verifyPresignedToken: (token, key) => memoryStorage.verifyPresignedToken(token, key),
  consumePresignedToken: (token) => memoryStorage.consumePresignedToken(token),
  clear: () => memoryStorage.clear(),
};
