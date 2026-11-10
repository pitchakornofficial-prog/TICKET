import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = process.cwd();

describe('Organizer Overview Executive 4-KPI Grid, Search, Filter & Vertical Cards with Pagination', () => {
  it('confirms complete removal of visual analytics charts section', () => {
    const fileContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );

    expect(fileContent).not.toContain('overview-charts-card');
    expect(fileContent).not.toContain('overview-charts-panel');
    expect(fileContent).not.toContain('overview-barchart');
    expect(fileContent).not.toContain('overview-linechart');
    expect(fileContent).not.toContain('charts-mode-tabs');
  });

  it('verifies 4-Hero-Card Executive Grid with detailed net breakdown, capacity progress, and multi-period metrics', () => {
    const fileContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );

    expect(fileContent).toContain('overview-4kpi-grid');
    expect(fileContent).toContain('kpi-hero-card');

    // Financial breakdown inside revenue card
    expect(fileContent).toContain('overview-kpi-breakdown-box');
    expect(fileContent).toContain('หักค่าบริการระบบ (3%):');
    expect(fileContent).toContain('รายได้สุทธิรอรับเงิน:');
    expect(fileContent).toContain('highlight-net-row');

    // Capacity progress inside ticket card
    expect(fileContent).toContain('kpi-progress-wrap');
    expect(fileContent).toContain('kpi-progress-bar-track');
    expect(fileContent).toContain('kpi-progress-bar-fill');
    expect(fileContent).toContain('ความคืบหน้าการขาย:');
    expect(fileContent).toContain('คงเหลือ:');

    // Portfolio chips inside concert status card
    expect(fileContent).toContain('kpi-status-chips-wrap');
    expect(fileContent).toContain('kpi-chip-item success');
    expect(fileContent).toContain('kpi-chip-item warning');

    // Multi-period stack inside 4th card
    expect(fileContent).toContain('kpi-period-metrics-stack');
    expect(fileContent).toContain('overview-kpi-today');
    expect(fileContent).toContain('overview-kpi-week');
    expect(fileContent).toContain('overview-kpi-month');
  });

  it('verifies real-time search, status filter, and sorting toolbar', () => {
    const fileContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );

    expect(fileContent).toContain('performance-filter-toolbar');
    expect(fileContent).toContain('filter-search-input');
    expect(fileContent).toContain('filter-clear-btn');
    expect(fileContent).toContain('perf-filter-select-wrap');
    expect(fileContent).toContain('perf-filter-select');
    expect(fileContent).toContain('handleSearchChange');
    expect(fileContent).toContain('handleStatusChange');
    expect(fileContent).toContain('handleSortChange');
  });

  it('verifies horizontal concert performance card structure without image media, with progress and direct actions', () => {
    const fileContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );

    expect(fileContent).toContain('overview-performance-grid');
    expect(fileContent).toContain('overview-concert-card horizontal-card');
    expect(fileContent).not.toContain('concert-vcard-media');
    expect(fileContent).toContain('concert-status-badge-row');
    expect(fileContent).toContain('concert-card-zone-info');
    expect(fileContent).toContain('concert-progress-box');
    expect(fileContent).toContain('concert-card-zone-finance');
    expect(fileContent).toContain('concert-card-zone-actions');
    expect(fileContent).toContain('btn-store');
    expect(fileContent).toContain('btn-finance');
    expect(fileContent).toContain('btn-manage');
  });

  it('verifies pagination navigation with 4 items per page, previous, next, and numbered page buttons', () => {
    const fileContent = readFileSync(
      join(rootDir, 'src/components/organizer-overview-view.tsx'),
      'utf8',
    );

    expect(fileContent).toContain('overview-pagination-bar');
    expect(fileContent).toContain('pagination-info-text');
    expect(fileContent).toContain('pagination-buttons-group');
    expect(fileContent).toContain('pagination-btn page-num-btn');
    expect(fileContent).toContain('ITEMS_PER_PAGE = 4');
  });

  it('verifies globals.css includes rules for 4kpi grid, toolbar, horizontal cards, and pagination', () => {
    const cssContent = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');

    expect(cssContent).toContain('.overview-4kpi-grid');
    expect(cssContent).toContain('.kpi-hero-card');
    expect(cssContent).toContain('.overview-kpi-breakdown-box');
    expect(cssContent).toContain('.performance-filter-toolbar');
    expect(cssContent).toContain('.perf-filter-select');
    expect(cssContent).toContain('.overview-performance-grid');
    expect(cssContent).toContain('.overview-concert-card');
    expect(cssContent).toContain('.concert-status-badge-row');
    expect(cssContent).toContain('.overview-pagination-bar');
  });

  it('strictly adheres to 100% Zero Emojis (D-14) in all modified files', () => {
    const filesToCheck = [
      'src/components/organizer-overview-view.tsx',
      'tests/unit/organizer-visual-analytics.test.ts',
      'tests/unit/d210-d216-organizer-overview-modernization.test.ts',
      'tests/unit/organizer-overview-view.test.ts',
    ];

    const emojiRegex = /\p{Extended_Pictographic}/u;

    for (const relPath of filesToCheck) {
      const content = readFileSync(join(rootDir, relPath), 'utf8');
      expect(content).not.toMatch(emojiRegex);
    }
  });
});
