import { describe, expect, it, vi } from 'vitest';
import { POST, handlePresignedRequest } from '../../src/app/api/upload/route';
import { POST as presignedPOST } from '../../src/app/api/upload/presigned/route';
import { GET } from '../../src/app/api/media/[...key]/route';
import { storage } from '../../src/server/storage';

let currentRole = 'organizer';
const currentUserId = 'user-org-1';

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => ({
        session: { id: 'sess-1', userId: currentUserId, expiresAt: new Date(Date.now() + 3600000) },
        user: { id: currentUserId, name: 'Test User', email: 'test@ticket.invalid', role: currentRole },
      }),
    },
  }),
  readActor: async () => ({
    id: currentUserId,
    role: currentRole,
    name: 'Test User',
  }),
}));

describe('Issue #4: Stored XSS Prevention & File Upload Security (AC-92, Issue-04)', () => {
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  const validJpgBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const validWebpBuffer = Buffer.from(
    'RIFF\x20\x00\x00\x00WEBPVP8 \x14\x00\x00\x00',
    'binary',
  );
  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF',
  );

  function createUploadRequest(
    fileBuffer: Buffer,
    fileName: string,
    fileType: string,
    visibility: 'public' | 'private' = 'public',
  ) {
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: fileType });
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('visibility', visibility);

    return new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });
  }

  it('rejects direct HTML file upload with 400 Bad Request', async () => {
    currentRole = 'organizer';
    const htmlPayload = Buffer.from('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>');
    const req = createUploadRequest(htmlPayload, 'exploit.html', 'text/html', 'public');

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('ประเภทไฟล์ไม่ถูกต้อง');
  });

  it('rejects SVG file upload (active vector) with 400 Bad Request', async () => {
    currentRole = 'organizer';
    const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const req = createUploadRequest(svgPayload, 'vector.svg', 'image/svg+xml', 'public');

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('ประเภทไฟล์ไม่ถูกต้อง');
  });

  it('rejects disguised HTML with .png extension failing magic byte check', async () => {
    currentRole = 'organizer';
    const fakePng = Buffer.from('<html><script>steal(document.cookie)</script></html>');
    const req = createUploadRequest(fakePng, 'malicious.png', 'image/png', 'public');

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('เนื้อหาไฟล์ไม่ตรงกับรูปแบบที่ได้รับอนุญาต');
  });

  it('rejects polyglot image containing script tags', async () => {
    currentRole = 'organizer';
    const polyglot = Buffer.concat([
      validPngBuffer,
      Buffer.from('<script>alert(document.domain)</script>'),
    ]);
    const req = createUploadRequest(polyglot, 'polyglot.png', 'image/png', 'public');

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('พบโค้ดหรือแท็กอันตรายในเนื้อหาไฟล์รูปภาพ');
  });

  it('rejects PDF file upload for public concert posters', async () => {
    currentRole = 'organizer';
    const req = createUploadRequest(validPdfBuffer, 'document.pdf', 'application/pdf', 'public');

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('ประเภทไฟล์ไม่ถูกต้อง');
  });

  it('accepts valid PNG, JPG, and WebP for public posters by organizer', async () => {
    currentRole = 'organizer';

    // PNG
    const pngReq = createUploadRequest(validPngBuffer, 'poster.png', 'image/png', 'public');
    const pngRes = await POST(pngReq);
    expect(pngRes.status).toBe(201);
    const pngBody = await pngRes.json();
    expect(pngBody.key).toMatch(/^posters\/.*\.png$/);

    // JPG
    const jpgReq = createUploadRequest(validJpgBuffer, 'poster.jpg', 'image/jpeg', 'public');
    const jpgRes = await POST(jpgReq);
    expect(jpgRes.status).toBe(201);
    const jpgBody = await jpgRes.json();
    expect(jpgBody.key).toMatch(/^posters\/.*\.jpg$/);

    // WebP
    const webpReq = createUploadRequest(validWebpBuffer, 'poster.webp', 'image/webp', 'public');
    const webpRes = await POST(webpReq);
    expect(webpRes.status).toBe(201);
    const webpBody = await webpRes.json();
    expect(webpBody.key).toMatch(/^posters\/.*\.webp$/);
  });

  it('allows owner to upload valid PDF for private proofs', async () => {
    currentRole = 'owner';
    const pdfReq = createUploadRequest(validPdfBuffer, 'payout-receipt.pdf', 'application/pdf', 'private');

    const pdfRes = await POST(pdfReq);
    expect(pdfRes.status).toBe(201);
    const pdfBody = await pdfRes.json();
    expect(pdfBody.key).toMatch(/^proofs\/.*\.pdf$/);
  });

  it('serves images with CSP sandbox, nosniff, DENY frame options, and inline disposition', async () => {
    currentRole = 'organizer';
    const key = 'posters/test-safe-poster.png';
    await storage.put(key, validPngBuffer, 'image/png', 'public');

    const req = new Request(`http://localhost:3000/api/media/${key}`);
    const res = await GET(req, { params: Promise.resolve({ key: key.split('/') }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Disposition')).toContain('inline;');
  });

  it('forces attachment download disposition for PDF documents', async () => {
    currentRole = 'owner';
    const key = 'proofs/test-transfer-slip.pdf';
    await storage.put(key, validPdfBuffer, 'application/pdf', 'private');

    const req = new Request(`http://localhost:3000/api/media/${key}`);
    const res = await GET(req, { params: Promise.resolve({ key: key.split('/') }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Disposition')).toContain('attachment;');
  });

  it('forces application/octet-stream and attachment download for legacy/unexpected types', async () => {
    currentRole = 'owner';
    const key = 'proofs/legacy-unexpected.html';
    // Even if storage somehow contained text/html
    await storage.put(key, Buffer.from('<b>test</b>'), 'text/html', 'private');

    const req = new Request(`http://localhost:3000/api/media/${key}`);
    const res = await GET(req, { params: Promise.resolve({ key: key.split('/') }) });

    expect(res.status).toBe(200);
    // Never served as text/html!
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toContain('attachment;');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('enforces MIME allowlist in handlePresignedRequest (rejects text/html; charset=utf-8, application/xhtml+xml, text/xml)', async () => {
    for (const mime of ['text/html; charset=utf-8', 'application/xhtml+xml', 'text/xml']) {
      const res = await handlePresignedRequest(
        { id: currentUserId, role: 'organizer' },
        { filename: 'poster.png', contentType: mime, fileSize: 1024, visibility: 'public' },
      );
      expect(res.status).toBe(400);
    }

    const publicPdfRes = await handlePresignedRequest(
      { id: currentUserId, role: 'organizer' },
      { filename: 'doc.pdf', contentType: 'application/pdf', fileSize: 1024, visibility: 'public' },
    );
    expect(publicPdfRes.status).toBe(400);
  });

  it('rejects cross-site POST /api/upload and POST /api/upload/presigned with 403', async () => {
    currentRole = 'organizer';
    const uploadReq = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'poster.png', contentType: 'image/png', fileSize: 1024 }),
    });
    const uploadRes = await POST(uploadReq);
    expect(uploadRes.status).toBe(403);

    const presignedReq = new Request('http://localhost:3000/api/upload/presigned', {
      method: 'POST',
      headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'poster.png', contentType: 'image/png', fileSize: 1024 }),
    });
    const presignedRes = await presignedPOST(presignedReq);
    expect(presignedRes.status).toBe(403);
  });

  it('blocks path traversal, disallowed prefixes, and non-owner proofs/ access in /api/media/[...key]', async () => {
    currentRole = 'organizer';

    const traversalRes = await GET(new Request('http://localhost:3000/api/media/posters/..%2Fsecret.png'), {
      params: Promise.resolve({ key: ['posters', '..', 'secret.png'] }),
    });
    expect(traversalRes.status).toBe(400);

    const badPrefixRes = await GET(new Request('http://localhost:3000/api/media/private-keys/secret.png'), {
      params: Promise.resolve({ key: ['private-keys', 'secret.png'] }),
    });
    expect(badPrefixRes.status).toBe(403);

    // Defense-in-depth: proofs/ requires owner even if visibility metadata was mistakenly public
    const proofKey = 'proofs/defense-in-depth.png';
    await storage.put(proofKey, validPngBuffer, 'image/png', 'public');
    const nonOwnerProofRes = await GET(new Request(`http://localhost:3000/api/media/${proofKey}`), {
      params: Promise.resolve({ key: proofKey.split('/') }),
    });
    expect(nonOwnerProofRes.status).toBe(403);
  });
});
