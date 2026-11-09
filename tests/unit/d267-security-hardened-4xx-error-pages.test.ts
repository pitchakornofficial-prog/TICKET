import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('D-267: Security-Hardened 4xx and Error Pages', () => {
  const rootDir = resolve(__dirname, '../..');

  it('implements global not-found page with anti-reconnaissance neutral messaging', () => {
    const notFoundPage = readFileSync(
      resolve(rootDir, 'src/app/not-found.tsx'),
      'utf-8',
    );

    // Headline and messaging are neutral and do not leak whether resource exists
    expect(notFoundPage).toContain('ไม่พบหน้าเว็บ หรือไม่มีสิทธิ์เข้าถึงเนื้อหา');
    expect(notFoundPage).toContain('404 · ไม่พบหน้าเว็บ');
    expect(notFoundPage).toContain('href="/"');
    expect(notFoundPage).toContain('error-page-container');
    expect(notFoundPage).toContain('error-page-card');

    // Anti-reconnaissance checks: no tech stack or internal parameter exposure
    expect(notFoundPage).not.toContain('stack');
    expect(notFoundPage).not.toContain('trace');
    expect(notFoundPage).not.toContain('query');
    expect(notFoundPage).not.toContain('params');
  });

  it('implements global error boundary without leaking internal exception details', () => {
    const errorPage = readFileSync(
      resolve(rootDir, 'src/app/error.tsx'),
      'utf-8',
    );

    expect(errorPage).toContain('use client');
    expect(errorPage).toContain('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    expect(errorPage).toContain('ลองใหม่อีกครั้ง');
    expect(errorPage).toContain('error-page-container');

    // Ensures raw error message is never printed directly into UI (prevent information leak)
    expect(errorPage).not.toContain('{error.message}');
    expect(errorPage).not.toContain('{error.stack}');
  });

  it('implements clean responsive styling for error pages in globals.css', () => {
    const globalsCss = readFileSync(
      resolve(rootDir, 'src/app/globals.css'),
      'utf-8',
    );

    expect(globalsCss).toContain('.error-page-container');
    expect(globalsCss).toContain('.error-page-card');
    expect(globalsCss).toContain('.error-icon-wrap');
    expect(globalsCss).toContain('.error-badge');
    expect(globalsCss).toContain('.error-actions');
  });

  it('verifies 100% Zero Emojis compliance (D-14) in error page files', () => {
    const notFoundPage = readFileSync(
      resolve(rootDir, 'src/app/not-found.tsx'),
      'utf-8',
    );
    const errorPage = readFileSync(
      resolve(rootDir, 'src/app/error.tsx'),
      'utf-8',
    );
    const thisTest = readFileSync(
      resolve(rootDir, 'tests/unit/d267-security-hardened-4xx-error-pages.test.ts'),
      'utf-8',
    );

    expect(notFoundPage).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(errorPage).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(thisTest).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
