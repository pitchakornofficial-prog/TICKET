import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-196 Home Page Hero Banner Top Spacing Separation from Navbar', () => {
  const rootDir = process.cwd();

  it('verifies Item 1: globals.css adds margin-top to .upcoming-banner-section to separate from navbar', () => {
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Section defines top margin to prevent sticking directly to navbar
    expect(globalsCss).toMatch(/\.upcoming-banner-section\s*\{[^}]*margin-top:\s*clamp\(1rem,\s*2vw,\s*1\.75rem\);/);
    expect(globalsCss).toMatch(/\.upcoming-banner-section\s*\{[^}]*max-width:\s*100%;/);

    // Zero emojis check (D-14)
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 2: .banner-carousel-container includes border-top and border-bottom for clean edge separation', () => {
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Container has top and bottom border matching --line token
    expect(globalsCss).toMatch(/\.banner-carousel-container\s*\{[^}]*border-top:\s*1px solid var\(--line\);/);
    expect(globalsCss).toMatch(/\.banner-carousel-container\s*\{[^}]*border-bottom:\s*1px solid var\(--line\);/);
    expect(globalsCss).toMatch(/\.banner-carousel-container\s*\{[^}]*border-radius:\s*0;/);

    // Zero emojis check (D-14)
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 3: requirements documentation contains D-196', () => {
    const reqDoc = readFileSync(join(rootDir, 'docs/requirement.md'), 'utf8');

    expect(reqDoc).toContain('| D-196 |');
    expect(reqDoc).toContain('Home Page Hero Banner Top Spacing Separation from Navbar');
    expect(reqDoc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
