import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Security Patches & Production Hardening', () => {
  const rootDir = process.cwd();

  it('blocks test inspection endpoint in production mode (NODE_ENV=production)', () => {
    const authHttpSrc = readFileSync(resolve(rootDir, 'src/server/auth-http.ts'), 'utf8');
    expect(authHttpSrc).toContain("if (process.env.NODE_ENV === 'production')");
    expect(authHttpSrc).toContain("message: 'ไม่พบเส้นทางที่ร้องขอ'");
    expect(authHttpSrc).toContain('status: 404');
  });

  it('blocks dev captured-emails endpoint in production mode', () => {
    const devEmailsSrc = readFileSync(resolve(rootDir, 'src/app/api/dev/captured-emails/route.ts'), 'utf8');
    expect(devEmailsSrc).toContain("if (process.env.NODE_ENV === 'production')");
    expect(devEmailsSrc).toContain("message: 'ไม่พบเส้นทางที่ร้องขอ'");
    expect(devEmailsSrc).toContain('status: 404');
  });

  it('enforces file size limits and MIME/extension whitelisting in upload route', () => {
    const uploadSrc = readFileSync(resolve(rootDir, 'src/app/api/upload/route.ts'), 'utf8');
    expect(uploadSrc).toContain('MAX_FILE_SIZE = 10 * 1024 * 1024');
    expect(uploadSrc).toContain('ALLOWED_EXTENSIONS');
    expect(uploadSrc).toContain('ALLOWED_MIME_TYPES');
    expect(uploadSrc).toContain('ขนาดไฟล์เกินกำหนด');
    expect(uploadSrc).toContain('ประเภทไฟล์ไม่ได้รับอนุญาต');
    expect(uploadSrc).toContain('รูปแบบ MIME type ของไฟล์ไม่ถูกต้อง');
  });

  it('enforces nosniff security header in media serving route', () => {
    const mediaSrc = readFileSync(resolve(rootDir, 'src/app/api/media/[...key]/route.ts'), 'utf8');
    expect(mediaSrc).toContain("'X-Content-Type-Options': 'nosniff'");
  });
});
