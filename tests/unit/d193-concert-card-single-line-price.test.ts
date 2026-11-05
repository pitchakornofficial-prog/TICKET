import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-193 Concert Card Single-Line Price Display & Redundant Label Removal', () => {
  const rootDir = process.cwd();

  it('verifies Item 1 & 2: single-line starting price display and removal of redundant ราคาบัตร label in home-concert-catalog.tsx', () => {
    const catalogSrc = readFileSync(join(rootDir, 'src/components/home-concert-catalog.tsx'), 'utf8');

    // Price is rendered with starting price or free
    expect(catalogSrc).toContain('เริ่มต้น');
    expect(catalogSrc).toMatch(/formatBaht(?:Compact)?\(event\.startingPrice\)/);
    expect(catalogSrc).toContain('card-split-price');
    expect(catalogSrc).toContain('price-amount');
    expect(catalogSrc).toContain('card-split-buy-btn');

    // Redundant price-label "ราคาบัตร" is removed from concert card footers
    expect(catalogSrc).not.toContain('<span className="price-label">ราคาบัตร</span>');

    // Zero emojis check (D-14)
    expect(catalogSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 3: balanced layout, single-line nowrap, and overflow protection in globals.css', () => {
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Desktop .card-split-price and .price-amount styling
    expect(globalsCss).toContain('.card-split-price { display: flex; align-items: baseline; min-width: 0; overflow: hidden; white-space: nowrap; flex: 1; }');
    expect(globalsCss).toContain('.card-split-price .price-amount { font-size: 1.02rem; font-weight: 600; color: var(--blue); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }');

    // Buy button has flex-shrink: 0 to prevent squeezing
    expect(globalsCss).toContain('.card-split-buy-btn { font-size: .85rem; font-weight: 600; color: #ffffff; background: #0f172a; border: 1px solid #0f172a;');
    expect(globalsCss).toContain('flex-shrink: 0;');

    // Mobile media query has compact nowrap and overflow protection
    expect(globalsCss).toContain('@media (max-width: 640px)');
    expect(globalsCss).toContain('.card-split-price .price-amount {');
    expect(globalsCss).toContain('text-overflow: ellipsis;');

    // Zero emojis check (D-14)
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies requirements documentation contains D-193', () => {
    const reqDoc = readFileSync(join(rootDir, 'docs/requirement.md'), 'utf8');

    expect(reqDoc).toContain('| D-193 |');
    expect(reqDoc).toContain('Concert Card Single-Line Price Display & Redundant Label Removal');
    expect(reqDoc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
