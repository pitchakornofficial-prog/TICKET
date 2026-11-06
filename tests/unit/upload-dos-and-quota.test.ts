import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as presignedUploadPost } from '../../src/app/api/upload/presigned/route';
import { POST as uploadPost } from '../../src/app/api/upload/route';
import { R2StorageDriver } from '../../src/server/storage-r2';
import { storage } from '../../src/server/storage';
import {
  MAX_REQUEST_BODY_SIZE,
  MAX_UPLOADS_PER_WINDOW,
  checkAndReserveUploadQuota,
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
    options: {
      secret: 'test-secret-at-least-32-chars-long-xxx',
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

  beforeEach(async () => {
    currentRole = 'organizer';
    currentUserId = 'user-org-1';
    await resetUploadUsage();
    storage.clear();
  });

  describe('1. Early Request Size Pre-check (Content-Length Validation) & Bounded Stream Reading', () => {
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

    it('aborts body stream reading with 413 Payload Too Large when payload bytes exceed 16MB', async () => {
      // Simulate a request without Content-Length header whose stream sends 17MB
      const largeBuffer = Buffer.alloc(17 * 1024 * 1024);
      const req = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: largeBuffer,
      });

      const res = await uploadPost(req);
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.message).toContain('Payload Too Large');
    });
  });

  describe('2. Account Upload Quota & Atomic Reservation', () => {
    it('enforces maximum 20 uploads per 10-minute sliding window', async () => {
      for (let i = 0; i < MAX_UPLOADS_PER_WINDOW; i++) {
        const quota = await checkAndReserveUploadQuota(null, currentUserId, 1024);
        expect(quota.allowed).toBe(true);
      }

      // 21st upload attempt should be blocked
      const quota = await checkAndReserveUploadQuota(null, currentUserId, 1024);
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

    it('guarantees atomic quota reservation under concurrent requests (rejects 21st concurrent call)', async () => {
      // Launch 25 concurrent quota reservation requests
      const testUser = 'user-race-test';
      const results = await Promise.all(
        Array.from({ length: 25 }, () => checkAndReserveUploadQuota(null, testUser, 1024)),
      );

      const successCount = results.filter((r) => r.allowed).length;
      const failureCount = results.filter((r) => !r.allowed).length;

      // Exactly 20 must pass, exactly 5 must be rejected with no race window
      expect(successCount).toBe(20);
      expect(failureCount).toBe(5);
    });

    it('enforces 50MB cumulative size quota per 10-minute sliding window', async () => {
      // Reserve 4 x 12MB = 48MB (each file <= 15MB MAX_FILE_SIZE)
      for (let i = 0; i < 4; i++) {
        const res = await checkAndReserveUploadQuota(null, currentUserId, 12 * 1024 * 1024);
        expect(res.allowed).toBe(true);
      }

      // Uploading 5MB more (48MB + 5MB = 53MB) exceeds 50MB window ceiling
      const quota = await checkAndReserveUploadQuota(null, currentUserId, 5 * 1024 * 1024);
      expect(quota.allowed).toBe(false);
      expect(quota.reason).toContain('สูงสุด 50MB ต่อ 10 นาที');

      // Uploading 1MB is within quota (48MB + 1MB = 49MB <= 50MB)
      const withinQuota = await checkAndReserveUploadQuota(
        null,
        currentUserId,
        1 * 1024 * 1024,
      );
      expect(withinQuota.allowed).toBe(true);
    });

    it('fails closed when database operation throws an error (preserves quota integrity)', async () => {
      const mockBrokenPool = {
        connect: vi.fn().mockRejectedValue(new Error('PostgreSQL connection timeout or node crashed')),
      } as unknown as import('pg').Pool;

      const res = await checkAndReserveUploadQuota(mockBrokenPool, currentUserId, 1024);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('ระบบจัดเก็บข้อมูลไม่พร้อมให้บริการชั่วคราว');
      expect(res.retryAfterSeconds).toBe(30);
    });

    it('isolates upload quotas between different accounts', async () => {
      for (let i = 0; i < MAX_UPLOADS_PER_WINDOW; i++) {
        await checkAndReserveUploadQuota(null, 'user-A', 1024);
      }
      expect((await checkAndReserveUploadQuota(null, 'user-A', 1024)).allowed).toBe(false);
      expect((await checkAndReserveUploadQuota(null, 'user-B', 1024)).allowed).toBe(true);
    });
  });

  describe('3. Direct Upload with Presigned URL & Size Enforcement', () => {
    it('rejects oversized JSON request body exceeding 1MB with 413 Payload Too Large on presigned endpoint', async () => {
      // Create a 1.2MB JSON payload
      const padding = 'x'.repeat(1.2 * 1024 * 1024);
      const req = new Request('http://localhost:3000/api/upload/presigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(JSON.stringify({ filename: 'test.png', padding }))),
        },
        body: JSON.stringify({ filename: 'test.png', padding }),
      });

      const res = await presignedUploadPost(req);
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.message).toContain('Payload Too Large: สูงสุด 1MB');
    });

    it('rejects oversized JSON request body exceeding 1MB with 413 Payload Too Large on /api/upload', async () => {
      const padding = 'x'.repeat(1.2 * 1024 * 1024);
      const req = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: 'test.png', padding }),
      });

      const res = await uploadPost(req);
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.message).toContain('Payload Too Large: สูงสุด 1MB');
    });

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
      expect(body.headers['Content-Type']).toBe('image/webp');
      expect(body.headers['Content-Length']).toBe(String(2 * 1024 * 1024));
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

    it('binds Content-Length in AWS SigV4 signed headers for Cloudflare R2 driver', async () => {
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
        2048,
        600,
      );

      expect(presigned.uploadUrl).toContain(
        'https://test-account.r2.cloudflarestorage.com/ticket-assets/posters/event-123.jpg?',
      );
      expect(presigned.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(presigned.uploadUrl).toContain('X-Amz-Credential=test-r2-key%2F');
      expect(presigned.uploadUrl).toContain('X-Amz-Signature=');
      expect(presigned.uploadUrl).toContain('X-Amz-Expires=600');
      // Must sign content-length to bind upload size
      expect(presigned.uploadUrl).toContain('content-length');
      expect(presigned.method).toBe('PUT');
      expect(presigned.headers['Content-Type']).toBe('image/jpeg');
      expect(presigned.headers['Content-Length']).toBe('2048');
    });

    it('enforces maximum size bound on direct upload and rejects oversized payloads with 413', async () => {
      const { PUT } = await import('../../src/app/api/media/direct-upload/route');

      // Request presigned URL with max 10 bytes allowed
      const presigned = await storage.createPresignedUploadUrl(
        'posters/direct-upload-size-test.png',
        'image/png',
        'public',
        10, // max 10 bytes
      );

      // Upload valid PNG which is 16 bytes (> 10 bytes) -> Must be rejected with 413!
      const oversizedReq = new Request(`http://localhost:3000${presigned.uploadUrl}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(validPngBuffer.length),
        },
        body: new Uint8Array(validPngBuffer),
      });

      const rejectRes = await PUT(oversizedReq);
      expect(rejectRes.status).toBe(413);
      const rejectBody = await rejectRes.json();
      expect(rejectBody.message).toContain('Payload Too Large');
    });

    it('executes direct upload via presigned token and verifies content in storage', async () => {
      const presigned = await storage.createPresignedUploadUrl(
        'posters/direct-upload-test.png',
        'image/png',
        'public',
        validPngBuffer.length,
      );

      // Upload directly using presigned upload URL
      const { PUT } = await import('../../src/app/api/media/direct-upload/route');
      const directReq = new Request(`http://localhost:3000${presigned.uploadUrl}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(validPngBuffer.length),
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
