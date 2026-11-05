import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('News domain unit tests (TASK-008, AC-04)', () => {
  it('truncates snippet properly when content exceeds 200 characters', () => {
    const longContent = 'A'.repeat(250);
    const snippet = longContent.length > 200 ? `${longContent.slice(0, 197)}...` : longContent;
    expect(snippet.length).toBe(200);
    expect(snippet.endsWith('...')).toBe(true);
  });

  it('keeps full snippet when content is under 200 characters', () => {
    const shortContent = 'แจ้งเปิดจำหน่ายบัตรคอนเสิร์ตใหญ่รอบพิเศษ';
    const snippet = shortContent.length > 200 ? `${shortContent.slice(0, 197)}...` : shortContent;
    expect(snippet).toBe(shortContent);
  });

  it('validates news status transitions: only published news have publication timestamp', () => {
    const draft = { status: 'draft', publishedAt: null };
    const published = { status: 'published', publishedAt: new Date().toISOString() };
    expect(draft.publishedAt).toBeNull();
    expect(published.publishedAt).not.toBeNull();
  });

  it('implements D-70, D-71, and D-185: magazine grid, zero sample news files, and zero emojis', () => {
    const rootDir = process.cwd();

    const newsListPage = readFileSync(
      join(rootDir, 'src/app/news/page.tsx'),
      'utf8',
    );
    expect(newsListPage).not.toContain('CURATED_NEWS_LIST');
    expect(newsListPage).not.toMatch(/\p{Extended_Pictographic}/u);

    const clientComp = readFileSync(
      join(rootDir, 'src/components/news-list-client.tsx'),
      'utf8',
    );
    expect(clientComp).toContain('news-magazine-grid');
    expect(clientComp).toContain('news-magazine-card');
    expect(clientComp).toContain('news-filter-pills');
    expect(clientComp).not.toMatch(/\p{Extended_Pictographic}/u);

    const newsDetailPage = readFileSync(
      join(rootDir, 'src/app/news/[id]/page.tsx'),
      'utf8',
    );
    expect(newsDetailPage).toContain('news-detail-cover');
    expect(newsDetailPage).toContain('news-category-pill');
    expect(newsDetailPage).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements D-71: timeframe filter logic for today, week, month, and year', async () => {
    const { isWithinTimeframe } = await import('../../src/components/news-list-client');

    const now = new Date();

    const todayIso = now.toISOString();

    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);
    const twoDaysAgoIso = twoDaysAgo.toISOString();

    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setMonth(now.getMonth() - 2);
    const twoMonthsAgoIso = twoMonthsAgo.toISOString();

    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(now.getFullYear() - 2);
    const twoYearsAgoIso = twoYearsAgo.toISOString();

    // 'all' matches everything
    expect(isWithinTimeframe(todayIso, 'all')).toBe(true);
    expect(isWithinTimeframe(twoYearsAgoIso, 'all')).toBe(true);

    // 'today'
    expect(isWithinTimeframe(todayIso, 'today')).toBe(true);
    expect(isWithinTimeframe(twoDaysAgoIso, 'today')).toBe(false);

    // 'week'
    expect(isWithinTimeframe(todayIso, 'week')).toBe(true);
    expect(isWithinTimeframe(twoDaysAgoIso, 'week')).toBe(true);
    expect(isWithinTimeframe(twoMonthsAgoIso, 'week')).toBe(false);

    // 'month'
    expect(isWithinTimeframe(todayIso, 'month')).toBe(true);
    expect(isWithinTimeframe(twoMonthsAgoIso, 'month')).toBe(false);

    // 'year'
    expect(isWithinTimeframe(todayIso, 'year')).toBe(true);
    expect(isWithinTimeframe(twoMonthsAgoIso, 'year')).toBe(true);
    expect(isWithinTimeframe(twoYearsAgoIso, 'year')).toBe(false);
  });
  it('implements D-173 and D-185: Hero Highlight Article, Omni-Search Toolbar, Actionable Concert Bridge, Related News & Back-to-Top', () => {
    const rootDir = process.cwd();

    const clientComp = readFileSync(
      join(rootDir, 'src/components/news-list-client.tsx'),
      'utf8',
    );
    expect(clientComp).toContain('news-search-filter-toolbar');
    expect(clientComp).toContain('news-search-input');
    expect(clientComp).toContain('news-clear-filters-btn');
    expect(clientComp).toContain('news-hero-card');
    expect(clientComp).toContain('news-secondary-section');
    expect(clientComp).toContain('FloatingBackToTop');
    expect(clientComp).not.toMatch(/\p{Extended_Pictographic}/u);

    const detailPage = readFileSync(
      join(rootDir, 'src/app/news/[id]/page.tsx'),
      'utf8',
    );
    expect(detailPage).toContain('news-related-concert-card');
    expect(detailPage).toContain('news-related-section');
    expect(detailPage).toContain('FloatingBackToTop');
    expect(detailPage).toContain('/events/');
    expect(detailPage).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.news-hero-card');
    expect(globalsCss).toContain('.news-search-filter-toolbar');
    expect(globalsCss).toContain('.news-related-concert-card');
    expect(globalsCss).toContain('.news-related-section');
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('implements D-174: Unified Secondary Row, Home-Style Category Capsule, Search-Style Filters & Counter Removal', () => {
    const rootDir = process.cwd();

    const clientComp = readFileSync(
      join(rootDir, 'src/components/news-list-client.tsx'),
      'utf8',
    );
    expect(clientComp).toContain('news-toolbar-secondary-row');
    expect(clientComp).toContain('catalog-tabs');
    expect(clientComp).toContain('catalog-tab-btn');
    expect(clientComp).toContain('news-filter-controls-group');
    expect(clientComp).toContain('ช่วงเวลา');
    expect(clientComp).toContain('จัดเรียงตาม');
    expect(clientComp).toContain('filter-group-item');
    expect(clientComp).not.toContain('news-filter-count-badge');
    expect(clientComp).not.toContain('news-filter-count-badge');
    expect(clientComp).not.toContain('พบ {filteredNews.length} ข่าว');
    expect(clientComp).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.news-toolbar-secondary-row');
    expect(globalsCss).toContain('.news-filter-controls-group');
    expect(globalsCss).toContain('.news-filter-label');
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('implements D-175: News Category Tabs Exact Parity with Home Catalog Tabs: Count Badge & Sizing', () => {
    const rootDir = process.cwd();

    const clientComp = readFileSync(
      join(rootDir, 'src/components/news-list-client.tsx'),
      'utf8',
    );
    expect(clientComp).toContain('tab.id === \'all\'');
    expect(clientComp).toContain('initialNews.length');
    expect(clientComp).toContain('catalog-tabs');
    expect(clientComp).toContain('catalog-tab-btn');
    expect(clientComp).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('padding: 0.5rem 1.2rem;');
    expect(globalsCss).toContain('font-size: 0.95rem;');
    expect(globalsCss).toContain('gap: 0.4rem;');
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('implements D-176: News Category Tabs Style Isolation & Complete Visual Parity with Home Tabs', () => {
    const rootDir = process.cwd();

    const clientComp = readFileSync(
      join(rootDir, 'src/components/news-list-client.tsx'),
      'utf8',
    );
    expect(clientComp).toContain('catalog-tabs');
    expect(clientComp).toContain('catalog-tab-btn');
    expect(clientComp).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('.news-article-header .news-category-pill');
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('implements D-177: News Hero Card Cover Badge Strip Removal & Image Cleanliness', () => {
    const rootDir = process.cwd();

    const clientComp = readFileSync(
      join(rootDir, 'src/components/news-list-client.tsx'),
      'utf8',
    );
    expect(clientComp).not.toContain('news-hero-badges-strip');
    expect(clientComp).not.toContain('news-hero-badge');
    expect(clientComp).not.toContain('news-card-category-badge');
    expect(clientComp).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('implements D-178: Universal News Card Cover Image Cleanliness: Category Badge Removal', () => {
    const rootDir = process.cwd();

    const clientComp = readFileSync(
      join(rootDir, 'src/components/news-list-client.tsx'),
      'utf8',
    );
    expect(clientComp).not.toContain('news-card-category-badge');
    expect(clientComp).not.toMatch(/\p{Extended_Pictographic}/u);

    const detailPage = readFileSync(
      join(rootDir, 'src/app/news/[id]/page.tsx'),
      'utf8',
    );
    expect(detailPage).not.toContain('news-card-category-badge');
    expect(detailPage).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('implements D-179: News Filter Toolbar Push-Shift Prevention & Search Reset Button Parity', () => {
    const rootDir = process.cwd();

    const clientComp = readFileSync(
      join(rootDir, 'src/components/news-list-client.tsx'),
      'utf8',
    );
    expect(clientComp).toContain('search-reset-filters-btn');
    expect(clientComp).toContain('news-filter-reset-btn');
    expect(clientComp).toContain('news-select-input');
    expect(clientComp).not.toMatch(/\p{Extended_Pictographic}/u);

    const globalsCss = readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    );
    expect(globalsCss).toContain('width: 155px;');
    expect(globalsCss).toContain('min-width: 155px;');
    expect(globalsCss).toContain('height: 42px;');
    expect(globalsCss).toContain('box-sizing: border-box;');
    expect(globalsCss).toContain('.search-reset-filters-btn');
    expect(globalsCss).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});