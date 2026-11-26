import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SITE_ORIGIN,
  buildNewsArticleJsonLd,
  getSiteOrigin,
  serializeJsonLd,
  summarizeNewsDescription,
} from '@/lib/seo';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

vi.mock('@/server/database', () => ({
  getDatabasePool: () => {
    throw new Error('DB offline in unit test');
  },
}));

describe('SEO helpers', () => {
  it('resolves site origin and falls back safely', () => {
    expect(getSiteOrigin(undefined)).toBe(DEFAULT_SITE_ORIGIN);
    expect(getSiteOrigin('')).toBe(DEFAULT_SITE_ORIGIN);
    expect(getSiteOrigin('not-a-url')).toBe(DEFAULT_SITE_ORIGIN);
    expect(getSiteOrigin('https://ticket.example.com/app/')).toBe('https://ticket.example.com');
  });

  it('summarizes news descriptions cleanly', () => {
    expect(summarizeNewsDescription('   \n  ')).toBe(
      'ติดตามข่าวสารและความเคลื่อนไหวคอนเสิร์ตจาก TICKET',
    );
    expect(summarizeNewsDescription('บรรทัดแรก\n\nบรรทัดสอง', 50)).toBe('บรรทัดแรก บรรทัดสอง');
    expect(summarizeNewsDescription('a'.repeat(180), 20)).toBe(`${'a'.repeat(17)}...`);
  });

  it('builds NewsArticle JSON-LD and escapes angle brackets', () => {
    const jsonLd = buildNewsArticleJsonLd({
      id: 'news-1',
      title: 'ประกาศเปิดขายบัตร <รอบพิเศษ>',
      description: 'รายละเอียดการเปิดขายบัตร',
      publishedAt: '2026-11-27T00:00:00.000Z',
      authorName: 'ทีมงาน TICKET',
      coverUrl: '/uploads/cover.jpg',
      siteOrigin: 'https://ticket.example.com',
    });

    expect(jsonLd['@type']).toBe('NewsArticle');
    expect(jsonLd.mainEntityOfPage['@id']).toBe('https://ticket.example.com/news/news-1');
    expect(jsonLd.image).toEqual(['https://ticket.example.com/uploads/cover.jpg']);

    const serialized = serializeJsonLd(jsonLd);
    expect(serialized).not.toContain('<');
    expect(serialized).toContain('\\u003cรอบพิเศษ>');
  });
});

describe('robots and sitemap routes', () => {
  it('disallows private routes and points to sitemap.xml', () => {
    const result = robots();
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
    expect(result.rules).toEqual(
      expect.objectContaining({
        userAgent: '*',
        allow: '/',
        disallow: expect.arrayContaining(['/api/', '/admin/', '/organizer/', '/back-office/']),
      }),
    );
  });

  it('returns static public routes in sitemap even when database is unavailable', async () => {
    const entries = await sitemap();
    const urls = entries.map(entry => entry.url);
    expect(urls.some(url => url.endsWith('/news'))).toBe(true);
    expect(urls.some(url => url.endsWith('/about'))).toBe(true);
  });
});
