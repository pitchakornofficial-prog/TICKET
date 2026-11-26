import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/lib/seo';
import { getDatabasePool } from '@/server/database';
import { listPublishedNews } from '@/server/news';

export const revalidate = 300;

const STATIC_PUBLIC_PATHS: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '/', changeFrequency: 'hourly', priority: 1.0 },
  { path: '/news', changeFrequency: 'hourly', priority: 0.9 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/refund-policy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const entries: MetadataRoute.Sitemap = STATIC_PUBLIC_PATHS.map(item => ({
    url: `${origin}${item.path}`,
    changeFrequency: item.changeFrequency,
    priority: item.priority,
  }));

  try {
    const pool = getDatabasePool();
    const [newsItems, eventRows] = await Promise.all([
      listPublishedNews(pool).catch(() => []),
      pool
        .query<{ id: string; updatedAt: Date | string; createdAt: Date | string }>(
          `SELECT id, "updatedAt", "createdAt"
           FROM events
           WHERE status = 'approved'
           ORDER BY "createdAt" DESC`,
        )
        .then(res => res.rows)
        .catch(() => []),
    ]);

    for (const news of newsItems) {
      entries.push({
        url: `${origin}/news/${encodeURIComponent(news.id)}`,
        lastModified: new Date(news.publishedAt || news.createdAt),
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }

    for (const event of eventRows) {
      entries.push({
        url: `${origin}/events/${encodeURIComponent(event.id)}`,
        lastModified: new Date(event.updatedAt || event.createdAt),
        changeFrequency: 'daily',
        priority: 0.9,
      });
    }
  } catch {
    // Keep static sitemap entries when database is unreachable during build/local checks.
  }

  return entries;
}
