import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-253: Enterprise Custom Select Dropdown Styling, Relaxed Card Breathing Room & Spacious Action Column Spacing', () => {
  const rootDir = process.cwd();

  it('verifies D-253: Enterprise Custom Select Dropdown styling with SVG Chevron, 38px height and smooth states (Q1 -> A1)', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Rule contains all relevant select classes
    expect(cssContent).toContain('.hub-sort-select');
    expect(cssContent).toContain('.hub-filter-select');
    expect(cssContent).toContain('.search-filter-select');
    expect(cssContent).toContain('.admin-filter-select');
    expect(cssContent).toContain('.form-select-control');

    // Custom appearance & SVG Chevron
    expect(cssContent).toContain('appearance: none;');
    expect(cssContent).toContain('-webkit-appearance: none;');
    expect(cssContent).toContain('data:image/svg+xml');
    expect(cssContent).toContain('background-repeat: no-repeat;');
    expect(cssContent).toContain('background-position: right 0.75rem center;');

    // 38px Standard Height & Balanced Padding
    expect(cssContent).toContain('padding: 0 2.2rem 0 0.85rem;');
    expect(cssContent).toContain('border-radius: 8px;');

    // Focus state with subtle ring
    expect(cssContent).toContain('box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);');
  });

  it('verifies D-253: Relaxed Card Spacing & Layered Internal Padding (Q2 -> B1)', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // List container gap: 1.5rem (24px)
    expect(cssContent).toContain('.concert-horizontal-list {');
    expect(cssContent).toContain('.hub-list-container,');
    expect(cssContent).toContain('.payable-concerts-list,');
    expect(cssContent).toContain('.payout-history-list');
    expect(cssContent).toContain('gap: 1.5rem;');

    // Card padding: 1.5rem 1.75rem
    expect(cssContent).toContain('padding: 1.5rem 1.75rem;');

    // Card internal vertical rhythm gap: 0.65rem
    expect(cssContent).toContain('gap: 0.65rem;');
  });

  it('verifies D-253: Spacious Action Column & Generous Button Gap (Q3 -> C1)', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // Card-to-column gap: 2rem
    expect(cssContent).toContain('gap: 2rem;');

    // Action column padding & button gap: 1.75rem padding-left, 0.75rem gap
    expect(cssContent).toContain('padding-left: 1.75rem;');
    expect(cssContent).toContain('gap: 0.75rem;');

    // Mobile media query: 1.25rem padding-top & 0.75rem button gap
    expect(cssContent).toContain('padding-top: 1.25rem;');
  });

  it('verifies D-253: Toolbar search box and refresh button align at 38px height', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    // .hub-search-box has height: 38px
    expect(cssContent).toMatch(/\.hub-search-box\s*\{[^}]*height:\s*38px;/);

    // .hub-refresh-btn has height: 38px
    expect(cssContent).toMatch(/\.hub-refresh-btn\s*\{[^}]*height:\s*38px;/);
  });

  it('verifies D-14: Zero Emojis compliance across all touched files', () => {
    const filesToCheck = [
      'src/app/globals.css',
      'src/components/owner-finance-hub.tsx',
      'docs/requirement.md',
      'tests/unit/d253-select-dropdown-and-card-spacing.test.ts',
    ];

    const emojiRegex =
      /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;

    for (const file of filesToCheck) {
      const content = readFileSync(join(rootDir, file), 'utf8');
      expect(emojiRegex.test(content)).toBe(false);
    }
  });
});
