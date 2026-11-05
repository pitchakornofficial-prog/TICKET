import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-192 Home Catalog Section Divider & Responsive 2-Column Compact Concert Card Grid', () => {
  const rootDir = process.cwd();

  it('verifies Item 1: catalog section divider exists above catalog in home concert catalog component and globals.css', () => {
    const catalogSrc = readFileSync(join(rootDir, 'src/components/home-concert-catalog.tsx'), 'utf8');
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Section divider in component markup
    expect(catalogSrc).toContain('catalog-section-divider');

    // Section divider in CSS
    expect(globalsCss).toContain('.catalog-section-divider {');
    expect(globalsCss).toContain('background: var(--line, #e2e8f0);');

    // Zero emojis check (D-14)
    expect(catalogSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 2: mobile responsive 2-column compact grid and styles in globals.css', () => {
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // 2-column mobile grid definition
    expect(globalsCss).toContain('@media (max-width: 640px)');
    expect(globalsCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');

    // Compact styling for mobile card details
    expect(globalsCss).toContain('.card-split-info-box {');
    expect(globalsCss).toContain('.card-split-title {');
    expect(globalsCss).toContain('.card-split-buy-btn {');

    // Zero emojis check (D-14)
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
