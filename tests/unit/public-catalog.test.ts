import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatBaht, formatDate, formatTime, locale, timeZone } from '../../src/lib/locale.ts';

describe('Public catalog formatting and locale (TASK-007, G-47)', () => {
  it('formats dates in Thai locale and Asia/Bangkok time zone', () => {
    expect(locale).toBe('th-TH');
    expect(timeZone).toBe('Asia/Bangkok');

    // 2026-11-15T19:00:00+07:00
    const sampleDate = new Date('2026-11-15T12:00:00Z');
    const formatted = formatDate(sampleDate);
    expect(formatted).toContain('พฤศจิกายน');
    expect(formatted).toContain('2569');

    const formattedTime = formatTime(sampleDate);
    expect(formattedTime).toBe('19:00');
  });

  it('formats prices in Thai Baht (THB) currency', () => {
    expect(formatBaht(1500)).toBe('฿1,500.00');
    expect(formatBaht(0)).toBe('฿0.00');
    expect(formatBaht(3250.5)).toBe('฿3,250.50');
  });

  it('implements D-159: Home Banner Card 240-440px Dimension Prototype & 1280px Centered Frame Alignment', () => {
    const rootDir = process.cwd();
    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toMatch(
      /\.upcoming-banner-section\s*\{[^}]*max-width:\s*1280px;/,
    );
    expect(globalsCss).toMatch(
      /\.upcoming-banner-section\s*\{[^}]*margin:\s*0 auto;/,
    );
    expect(globalsCss).toMatch(
      /\.banner-carousel-container\s*\{[^}]*border:\s*var\(--border-card\);/,
    );
    expect(globalsCss).toMatch(
      /\.banner-image\s*\{[^}]*min-height:\s*240px;/,
    );
    expect(globalsCss).toMatch(
      /\.banner-image\s*\{[^}]*max-height:\s*440px;/,
    );
    expect(globalsCss).toMatch(
      /\.banner-graphic-card\s*\{[^}]*min-height:\s*240px;/,
    );
    expect(globalsCss).toMatch(
      /\.banner-graphic-card\s*\{[^}]*max-height:\s*440px;/,
    );
  });

  it('implements D-160: Home Banner Carousel 0.6s Cross-Fade Transition & Borderless Standalone Arrows', () => {
    const rootDir = process.cwd();
    const catalogSource = readFileSync(
      join(rootDir, 'src/components/home-concert-catalog.tsx'),
      'utf8',
    );
    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );

    // Fade track and slide states in HomeConcertCatalog
    expect(catalogSource).toContain('banner-fade-track');
    expect(catalogSource).toContain('banner-slide-active');
    expect(catalogSource).toContain('banner-slide-inactive');

    // CSS Cross-fade transition
    expect(globalsCss).toMatch(
      /\.banner-slide-link\s*\{[^}]*transition:[^;]*opacity 0\.6s ease-in-out/,
    );
    expect(globalsCss).toMatch(
      /\.banner-slide-link\.banner-slide-inactive\s*\{[^}]*opacity:\s*0;/,
    );
    expect(globalsCss).toMatch(
      /\.banner-slide-link\.banner-slide-active\s*\{[^}]*opacity:\s*1;/,
    );

    // Borderless arrows with 32px icons
    expect(globalsCss).toMatch(
      /\.carousel-arrow\s*\{[^}]*background:\s*transparent;/,
    );
    expect(globalsCss).toMatch(
      /\.carousel-arrow\s*\{[^}]*border:\s*none;/,
    );
    expect(globalsCss).toMatch(
      /\.carousel-arrow\s*\{[^}]*filter:\s*drop-shadow\(0 2px 8px rgba\(0,\s*0,\s*0,\s*0\.65\)\);/,
    );
    expect(globalsCss).toMatch(
      /\.carousel-arrow svg\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/,
    );

    // D-14 Zero Emojis check
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(catalogSource)).toBe(false);
  });
});
