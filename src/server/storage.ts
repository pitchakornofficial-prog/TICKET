// ADR-0003: Cloudflare R2 สำหรับเก็บภาพและหลักฐาน
// Local substitute ที่ปลอดภัย ใช้ in-memory store หรือ loopback serving โดยไม่ใช้ instance-local persistent disk เป็น shared production storage

export interface StorageDriver {
  put(key: string, data: Uint8Array | Buffer, contentType: string, visibility?: 'public' | 'private'): Promise<{ url: string; key: string }>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

class MemoryStorageDouble implements StorageDriver {
  private files = new Map<string, { data: Buffer; contentType: string; visibility: 'public' | 'private' }>();

  async put(key: string, data: Uint8Array | Buffer, contentType: string, visibility: 'public' | 'private' = 'public'): Promise<{ url: string; key: string }> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.files.set(key, { data: buf, contentType, visibility });
    // In local development / testing, public assets can be read via /api/media/[...key]
    const url = `/api/media/${encodeURIComponent(key)}`;
    return { url, key };
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const item = this.files.get(key);
    if (!item) return null;
    return { data: item.data, contentType: item.contentType };
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }

  clear(): void {
    this.files.clear();
  }
}

export const storage = new MemoryStorageDouble();
