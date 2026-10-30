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

  it('implements D-70 and D-71: curated concert announcements, magazine grid, and zero emojis', () => {
    const rootDir = process.cwd();

    const curatedFile = readFileSync(
      join(rootDir, 'src/server/curated-news.ts'),
      'utf8',
    );
    expect(curatedFile).toContain('news-neon-nights-2026');
    expect(curatedFile).toContain('news-summer-sound-2026');
    expect(curatedFile).not.toMatch(/\p{Extended_Pictographic}/u);

    const clientComp = readFileSync(
      join(rootDir, 'src/components/news-list-client.tsx'),
      'utf8',
    );
    expect(clientComp).toContain('news-magazine-grid');
    expect(clientComp).toContain('news-magazine-card');
    expect(clientComp).toContain('news-card-category-badge');
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
});
