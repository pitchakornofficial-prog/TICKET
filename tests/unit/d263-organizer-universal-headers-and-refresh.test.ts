import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-263: Universal Organizer Headers Standardization and Inline Borderless Refresh', () => {
  const rootDir = process.cwd();

  const VIEWS = [
    { file: 'src/components/organizer-overview-view.tsx', testId: 'overview-refresh-btn' },
    { file: 'src/components/organizer-events-manager.tsx', testId: 'events-refresh-btn' },
    { file: 'src/components/organizer-scanner-manager.tsx', testId: 'scanners-refresh-btn' },
    { file: 'src/components/organizer-finance-view.tsx', testId: 'finance-inline-refresh-btn' },
    { file: 'src/components/organizer-news-view.tsx', testId: 'news-refresh-btn' },
    { file: 'src/components/organizer-policies-view.tsx', testId: 'policies-refresh-btn' },
    { file: 'src/components/organizer-guide-view.tsx', testId: 'guide-refresh-btn' },
    { file: 'src/components/organizer-contact-view.tsx', testId: 'contact-refresh-btn' },
  ];

  it('installs universal inline borderless refresh buttons across all 8 organizer views', () => {
    for (const view of VIEWS) {
      const content = readFileSync(join(rootDir, view.file), 'utf8');
      expect(content).toContain(view.testId);
      expect(content).toContain('RefreshIcon');
      expect(content).toContain('animate-spin');
    }
  });

  it('standardizes header title row and inline refresh styling in globals.css', () => {
    const css = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(css).toContain('.organizer-header-title-row');
    expect(css).toContain('.organizer-inline-refresh-btn');
    expect(css).toContain('.inline-refresh-icon');
  });

  it('standardizes all 8 organizer H1 page titles to 1.5rem and 700 weight', () => {
    const css = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    const titles = [
      '.overview-header-title',
      '.events-management-title',
      '.scanner-workspace-title-wrap h1',
      '.finance-management-title',
      '.news-management-title',
      '.policies-management-title',
      '.guide-page-title',
      '.contact-page-title',
    ];

    for (const title of titles) {
      expect(css).toContain(title);
    }
  });

  it('standardizes section H2 titles to 1.15rem so they never overpower page headers', () => {
    const css = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(css).toContain('.overview-performance-section .section-title');
    expect(css).toContain('font-size: 1.15rem;');
  });

  it('strictly adheres to 100% Zero Emojis (D-14) in all modified organizer files', () => {
    const emojiRegex = /\p{Extended_Pictographic}/u;
    for (const view of VIEWS) {
      const content = readFileSync(join(rootDir, view.file), 'utf8');
      expect(content).not.toMatch(emojiRegex);
    }
  });
});
