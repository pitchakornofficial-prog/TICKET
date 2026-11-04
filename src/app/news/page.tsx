import { getDatabasePool } from '@/server/database';
import { listPublishedNews, type PublicNewsSummary } from '@/server/news';
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

  // Only real published news from the database (D-185)
  const newsList: NewsItemDisplay[] = dbNewsList.map(n => ({
          id: n.id,
          title: n.title,
          snippet: n.snippet,
          coverUrl: n.coverUrl || undefined,
          category: (n as { category?: string }).category || 'ข่าวสาร',
          publishedAt: n.publishedAt,
          relatedConcertTitle: (n as { relatedConcertTitle?: string }).relatedConcertTitle,
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
