import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatBahtCompact } from '../../src/lib/locale.ts';

describe('D-194 Strict 4-Card Desktop Grid, 2-Card Mobile Grid & Compact Currency Formatting', () => {
  const rootDir = process.cwd();

  it('verifies formatBahtCompact formats whole numbers without .00 and preserves fractions when present', () => {
    expect(formatBahtCompact(150)).toBe('฿150');
    expect(formatBahtCompact(1500)).toBe('฿1,500');
    expect(formatBahtCompact(0)).toBe('฿0');
    expect(formatBahtCompact(150.5)).toBe('฿150.50');
    expect(formatBahtCompact(3250.75)).toBe('฿3,250.75');
  });

  it('verifies home-concert-catalog uses formatBahtCompact to prevent text ellipsis', () => {
    const catalogSrc = readFileSync(join(rootDir, 'src/components/home-concert-catalog.tsx'), 'utf8');

    expect(catalogSrc).toContain('formatBahtCompact');
    expect(catalogSrc).toContain('formatBahtCompact(event.startingPrice)');
    expect(catalogSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies globals.css enforces 4 cards on desktop, 3 cards on tablet, and 2 cards on mobile', () => {
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Desktop: 4 cards per row
    expect(globalsCss).toContain('.catalog-events-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(globalsCss).toContain('.search-results-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));');

    // Tablet: 3 cards per row
    expect(globalsCss).toContain('@media (max-width: 1023px)');
    expect(globalsCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');

    // Mobile: 2 cards per row
    expect(globalsCss).toContain('@media (max-width: 640px)');
    expect(globalsCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');

    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies requirements documentation contains D-194', () => {
    const reqDoc = readFileSync(join(rootDir, 'docs/requirement.md'), 'utf8');

    expect(reqDoc).toContain('| D-194 |');
    expect(reqDoc).toContain('Strict 4-Card Desktop Grid, 2-Card Mobile Grid & Compact Currency Formatting Without Ellipsis');
    expect(reqDoc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
