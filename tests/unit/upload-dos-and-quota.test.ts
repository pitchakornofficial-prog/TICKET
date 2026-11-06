import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as presignedUploadPost } from '../../src/app/api/upload/presigned/route';
import { POST as uploadPost } from '../../src/app/api/upload/route';
import { R2StorageDriver } from '../../src/server/storage-r2';
import { storage } from '../../src/server/storage';
import {
  MAX_REQUEST_BODY_SIZE,
  MAX_UPLOADS_PER_WINDOW,
  checkUploadQuota,
  recordUploadUsage,
  resetUploadUsage,
  validateUploadContentLength,
} from '../../src/server/upload-quota';

let currentRole = 'organizer';
let currentUserId = 'user-org-1';

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => ({
        session: {
          id: 'sess-1',
          userId: currentUserId,
          expiresAt: new Date(Date.now() + 3600000),
        },
        user: {
          id: currentUserId,
          name: 'Test Uploader',
          email: 'uploader@ticket.invalid',
          role: currentRole,
        },
      }),
    },
  }),
  readActor: async () => ({
    id: currentUserId,
    role: currentRole,
    name: 'Test Uploader',
  }),
}));

describe('Issue #10: Upload DoS Prevention, Quota & Presigned URL Direct Upload', () => {
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);

  function createUploadRequest(
    fileBuffer: Buffer,
    fileName: string,
    fileType: string,
    visibility: 'public' | 'private' = 'public',
    extraHeaders: Record<string, string> = {},
  ) {
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: fileType });
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('visibility', visibility);

    return new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      headers: extraHeaders,
      body: formData,
    });
  }

  beforeEach(() => {
    currentRole = 'organizer';
    currentUserId = 'user-org-1';
    resetUploadUsage();
    storage.clear();
  });

  describe('1. Early Request Size Pre-check (Content-Length Validation)', () => {
    it('validates Content-Length header correctly', () => {
      expect(validateUploadContentLength(null).valid).toBe(true);
      expect(validateUploadContentLength('1024').valid).toBe(true);
      expect(validateUploadContentLength(String(MAX_REQUEST_BODY_SIZE)).valid).toBe(true);

      const tooLarge = validateUploadContentLength(String(MAX_REQUEST_BODY_SIZE + 1));
      expect(tooLarge.valid).toBe(false);
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.error).toContain('Payload Too Large');

      const negative = validateUploadContentLength('-5');
      expect(negative.valid).toBe(false);
      expect(negative.status).toBe(400);

      const invalid = validateUploadContentLength('not-a-number');
      expect(invalid.valid).toBe(false);
      expect(invalid.status).toBe(400);
    });

    it('rejects oversized request before parsing with 413 Payload Too Large', async () => {
      const oversizedLength = 50 * 1024 * 1024; // 50MB
      const req = createUploadRequest(validPngBuffer, 'poster.png', 'image/png', 'public', {
        'content-length': String(oversizedLength),
      });

      const res = await uploadPost(req);
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.message).toContain('Payload Too Large');
    });

    it('rejects request with invalid content-length header with 400 Bad Request', async () => {
      const req = createUploadRequest(validPngBuffer, 'poster.png', 'image/png', 'public', {
        'content-length': 'invalid-size',
      });

      const res = await uploadPost(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('Content-Length ไม่ถูกต้อง');
    });
  });

  describe('2. Account Upload Quota & Rate Limiting', () => {
    it('enforces maximum 20 uploads per 10-minute sliding window', async () => {
      for (let i = 0; i < MAX_UPLOADS_PER_WINDOW; i++) {
        const quota = checkUploadQuota(currentUserId, 1024);
        expect(quota.allowed).toBe(true);
        recordUploadUsage(currentUserId, 1024);
      }

      // 21st upload attempt should be blocked
      const quota = checkUploadQuota(currentUserId, 1024);
      expect(quota.allowed).toBe(false);
      expect(quota.reason).toContain('สูงสุด 20 ไฟล์ต่อ 10 นาที');
      expect(quota.retryAfterSeconds).toBeGreaterThan(0);

      // Attempting API upload should return 429
      const req = createUploadRequest(validPngBuffer, 'poster.png', 'image/png', 'public');
      const res = await uploadPost(req);
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.message).toContain('เกินโควตา');
      expect(res.headers.get('Retry-After')).toBeDefined();
    });

    it('enforces 50MB cumulative size quota per 10-minute sliding window', async () => {
      // Simulate 45MB uploaded
      recordUploadUsage(currentUserId, 45 * 1024 * 1024);

      // Uploading 10MB more exceeds 50MB window ceiling
      const quota = checkUploadQuota(currentUserId, 10 * 1024 * 1024);
      expect(quota.allowed).toBe(false);
      expect(quota.reason).toContain('สูงสุด 50MB ต่อ 10 นาที');

      // Uploading 2MB is within quota
      const withinQuota = checkUploadQuota(currentUserId, 2 * 1024 * 1024);
      expect(withinQuota.allowed).toBe(true);
    });

    it('isolates upload quotas between different accounts', () => {
      for (let i = 0; i < MAX_UPLOADS_PER_WINDOW; i++) {
        recordUploadUsage('user-A', 1024);
      }
      expect(checkUploadQuota('user-A', 1024).allowed).toBe(false);
      expect(checkUploadQuota('user-B', 1024).allowed).toBe(true);
    });
  });

  describe('3. Direct Upload with Presigned URL', () => {
    it('creates presigned upload URL via POST /api/upload/presigned for organizer', async () => {
      const req = new Request('http://localhost:3000/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'concert-main-banner.webp',
          contentType: 'image/webp',
          fileSize: 2 * 1024 * 1024,
          visibility: 'public',
        }),
      });

      const res = await presignedUploadPost(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uploadUrl).toBeDefined();
      expect(body.key).toMatch(/^posters\/.*\.webp$/);
      expect(body.method).toBe('PUT');
      expect(body.headers['content-type']).toBe('image/webp');
      expect(body.headers['x-amz-meta-visibility']).toBe('public');
    });

    it('supports presigned URL mode via POST /api/upload when Content-Type is application/json', async () => {
      const req = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'poster.png',
          contentType: 'image/png',
          visibility: 'public',
        }),
      });

      const res = await uploadPost(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uploadUrl).toBeDefined();
      expect(body.key).toMatch(/^posters\/.*\.png$/);
    });

    it('rejects presigned URL request for private files by non-owner (AC-92)', async () => {
      currentRole = 'organizer';
      const req = new Request('http://localhost:3000/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'private-proof.pdf',
          contentType: 'application/pdf',
          visibility: 'private',
        }),
      });

      const res = await presignedUploadPost(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('เฉพาะผู้ดูแลระบบ (Owner)');
    });

    it('allows owner to request presigned URL for private PDF proofs', async () => {
      currentRole = 'owner';
      const req = new Request('http://localhost:3000/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'transfer-proof.pdf',
          contentType: 'application/pdf',
          visibility: 'private',
        }),
      });

      const res = await presignedUploadPost(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.key).toMatch(/^proofs\/.*\.pdf$/);
      expect(body.headers['x-amz-meta-visibility']).toBe('private');
    });

    it('rejects presigned URL request for dangerous or disallowed types', async () => {
      // HTML
      const htmlReq = new Request('http://localhost:3000/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'exploit.html',
          contentType: 'text/html',
        }),
      });
      const htmlRes = await presignedUploadPost(htmlReq);
      expect(htmlRes.status).toBe(400);

      // SVG
      const svgReq = new Request('http://localhost:3000/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'vector.svg',
          contentType: 'image/svg+xml',
        }),
      });
      const svgRes = await presignedUploadPost(svgReq);
      expect(svgRes.status).toBe(400);
    });

    it('generates AWS SigV4 query authentication for Cloudflare R2 driver', async () => {
      const r2Driver = new R2StorageDriver({
        accessKeyId: 'test-r2-key',
        secretAccessKey: 'test-r2-secret-32-chars-long-xxx',
        bucket: 'ticket-assets',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
      });

      const presigned = await r2Driver.createPresignedUploadUrl(
        'posters/event-123.jpg',
        'image/jpeg',
        'public',
        600,
      );

      expect(presigned.uploadUrl).toContain('https://test-account.r2.cloudflarestorage.com/ticket-assets/posters/event-123.jpg?');
      expect(presigned.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(presigned.uploadUrl).toContain('X-Amz-Credential=test-r2-key%2F');
      expect(presigned.uploadUrl).toContain('X-Amz-Signature=');
      expect(presigned.uploadUrl).toContain('X-Amz-Expires=600');
      expect(presigned.method).toBe('PUT');
      expect(presigned.headers['content-type']).toBe('image/jpeg');
    });

    it('executes direct upload via presigned token and verifies content in storage', async () => {
      const presigned = await storage.createPresignedUploadUrl(
        'posters/direct-upload-test.png',
        'image/png',
        'public',
      );

      // Upload directly using presigned upload URL
      const { PUT } = await import('../../src/app/api/media/direct-upload/route');
      const directReq = new Request(`http://localhost:3000${presigned.uploadUrl}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/png',
        },
        body: new Uint8Array(validPngBuffer),
      });

      const uploadRes = await PUT(directReq);
      expect(uploadRes.status).toBe(200);
      const uploadBody = await uploadRes.json();
      expect(uploadBody.success).toBe(true);

      // Verify item exists in storage
      const storedItem = await storage.get(presigned.key);
      expect(storedItem).toBeDefined();
      expect(storedItem?.contentType).toBe('image/png');
      expect(storedItem?.data.equals(validPngBuffer)).toBe(true);

      // Token should now be consumed and cannot be reused
      const replayReq = new Request(`http://localhost:3000${presigned.uploadUrl}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array(validPngBuffer),
      });
      const replayRes = await PUT(replayReq);
      expect(replayRes.status).toBe(403);
    });
  });
});
