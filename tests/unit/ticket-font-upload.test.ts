import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/app/api/owner/ticket-font-upload/route';
import { GET } from '../../src/app/api/media/[...key]/route';

let currentRole = 'owner';

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => ({
        session: { id: 'sess-font-1', userId: 'user-owner-1', expiresAt: new Date(Date.now() + 3600000) },
        user: { id: 'user-owner-1', name: 'Owner', email: 'owner@ticket.invalid', role: currentRole },
      }),
    },
  }),
  readActor: async () => ({
    id: 'user-owner-1',
    role: currentRole,
    name: 'Owner',
  }),
}));

describe('Ticket Designer Custom Font Upload & Media Serving (D-289)', () => {
  function createFontUploadRequest(bytes: Uint8Array, fileName: string) {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
    formData.append('file', blob, fileName);
    return new Request('http://localhost:3000/api/owner/ticket-font-upload', {
      method: 'POST',
      body: formData,
    });
  }

  it('rejects non-owner roles with 403 Forbidden', async () => {
    currentRole = 'organizer';
    const woff2Header = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00]);
    const res = await POST(createFontUploadRequest(woff2Header, 'BrandSans.woff2'));
    expect(res.status).toBe(403);
  });

  it('rejects unsupported file extensions and spoofed magic bytes', async () => {
    currentRole = 'owner';

    const exeRes = await POST(
      createFontUploadRequest(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), 'malware.exe'),
    );
    expect(exeRes.status).toBe(400);

    const fakeWoff2Res = await POST(
      createFontUploadRequest(new Uint8Array([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]), 'fake.woff2'),
    );
    expect(fakeWoff2Res.status).toBe(400);

    const fakeTtfRes = await POST(
      createFontUploadRequest(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'photo.ttf'),
    );
    expect(fakeTtfRes.status).toBe(400);
  });

  it('accepts valid WOFF2 and TTF font uploads and serves them inline via /api/media', async () => {
    currentRole = 'owner';

    const validWoff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00, 0x10, 0x20]);
    const woff2Res = await POST(createFontUploadRequest(validWoff2, 'ConcertHeadline-Bold.woff2'));
    expect(woff2Res.status).toBe(200);
    const woff2Json = (await woff2Res.json()) as { url: string; fontName: string };
    expect(woff2Json.fontName).toBe('ConcertHeadline-Bold');
    expect(woff2Json.url).toContain('/api/media/ticket-fonts');

    const encodedKey = woff2Json.url.replace('/api/media/', '');
    const decodedSegments = decodeURIComponent(encodedKey).split('/');
    const mediaRes = await GET(new Request(`http://localhost:3000${woff2Json.url}`), {
      params: Promise.resolve({ key: decodedSegments }),
    });
    expect(mediaRes.status).toBe(200);
    expect(mediaRes.headers.get('Content-Type')).toBe('font/woff2');
    expect(mediaRes.headers.get('Content-Disposition')).toContain('inline;');

    const validTtf = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00, 0x0f, 0x00, 0x80]);
    const ttfRes = await POST(createFontUploadRequest(validTtf, 'ThaiDisplay.ttf'));
    expect(ttfRes.status).toBe(200);
    const ttfJson = (await ttfRes.json()) as { url: string; fontName: string };
    expect(ttfJson.fontName).toBe('ThaiDisplay');
  });
});
