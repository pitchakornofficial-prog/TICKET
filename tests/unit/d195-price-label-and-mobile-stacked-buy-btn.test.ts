import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-195 Concert Card "ราคาเริ่มต้น" Label & Mobile Stacked Buy Button Layout', () => {
  const rootDir = process.cwd();

  it('verifies Item 1: home-concert-catalog.tsx renders "ราคาเริ่มต้น" with formatBahtCompact for concert cards', () => {
    const catalogSrc = readFileSync(join(rootDir, 'src/components/home-concert-catalog.tsx'), 'utf8');

    // Both catalog grid and search results grid display ราคาเริ่มต้น
    const matches = catalogSrc.match(/ราคาเริ่มต้น \$\{formatBahtCompact\(event\.startingPrice\)\}/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBeGreaterThanOrEqual(2);

    // Free ticket fallback is preserved
    expect(catalogSrc).toContain(": 'ฟรี'}");

    // Zero emojis check (D-14)
    expect(catalogSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 2: globals.css stacks mobile footer vertically and expands buy button full-width', () => {
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Mobile media query has column direction, stretch alignment, and full width buy button
    expect(globalsCss).toContain('@media (max-width: 640px)');
    expect(globalsCss).toContain('.card-split-footer');
    expect(globalsCss).toContain('flex-direction: column;');
    expect(globalsCss).toContain('align-items: stretch;');
    expect(globalsCss).toContain('.card-split-buy-btn');
    expect(globalsCss).toContain('width: 100%;');
    expect(globalsCss).toContain('text-align: center;');

    // Desktop/tablet maintains horizontal row with space-between
    expect(globalsCss).toContain('.card-split-footer { display: flex; align-items: center; justify-content: space-between;');

    // Ensure mobile card overrides are placed AFTER base desktop rules to guarantee correct cascade
    const desktopFooterIdx = globalsCss.indexOf('.card-split-footer { display: flex; align-items: center; justify-content: space-between;');
    const mobileOverridesIdx = globalsCss.indexOf('/* Mobile Responsive Card Split Overrides (D-192, D-193, D-194, D-195) */');
    expect(desktopFooterIdx).toBeGreaterThan(-1);
    expect(mobileOverridesIdx).toBeGreaterThan(desktopFooterIdx);

    // Zero emojis check (D-14)
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 3: requirements documentation contains D-195', () => {
    const reqDoc = readFileSync(join(rootDir, 'docs/requirement.md'), 'utf8');

    expect(reqDoc).toContain('| D-195 |');
    expect(reqDoc).toContain('Concert Card "ราคาเริ่มต้น" Label & Mobile Stacked Buy Button Layout');
    expect(reqDoc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
