import { getDatabasePool } from '@/server/database';
import { listPublishedNews, type PublicNewsSummary } from '@/server/news';
import { CURATED_NEWS_LIST } from '@/server/curated-news';
import { NewsListClient, type NewsItemDisplay } from '@/components/news-list-client';

export const metadata = {
  title: 'ข่าวสารและประกาศ — TICKET',
  description: 'ติดตามข่าวสาร ประกาศสำคัญ และข้อมูลความเคลื่อนไหวคอนเสิร์ตจาก TICKET',
};

export default async function NewsListPage() {
  let dbNewsList: PublicNewsSummary[] = [];

  try {
    const pool = getDatabasePool();
    dbNewsList = await listPublishedNews(pool);
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.warn('Unable to load public news:', error);
    }
  }

  // Use database news if published, otherwise use curated news announcements (D-70)
  const newsList: NewsItemDisplay[] =
    dbNewsList.length > 0
      ? dbNewsList.map(n => ({
          id: n.id,
          title: n.title,
          snippet: n.snippet,
          coverUrl: undefined,
          category: 'ข่าวสาร',
          publishedAt: n.publishedAt,
        }))
      : CURATED_NEWS_LIST.map(n => ({
          id: n.id,
          title: n.title,
          snippet: n.snippet,
          coverUrl: n.coverUrl,
          category: n.category,
          publishedAt: n.publishedAt,
        }));

  return (
    <article className="static-page news-page" aria-labelledby="news-title">
      <header className="static-header">
        <p className="eyebrow">TICKET / ข่าวสารและประกาศ</p>
        <h1 id="news-title">ข่าวสารและประกาศ</h1>
        <p className="intro">
          ติดตามข่าวสาร ความเคลื่อนไหว และประกาศสำคัญเกี่ยวกับงานคอนเสิร์ตบนระบบ TICKET
        </p>
      </header>

      <NewsListClient initialNews={newsList} />
    </article>
  );
}
