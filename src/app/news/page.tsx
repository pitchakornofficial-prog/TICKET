import Link from 'next/link';
import { TicketIcon } from '@/components/ticket-icon';
import { CalendarIcon, ChevronRightIcon } from '@/components/icons';
import { getDatabasePool } from '@/server/database';
import { listPublishedNews, type PublicNewsSummary } from '@/server/news';
import { formatDate } from '@/lib/locale';

export const metadata = {
  title: 'ข่าวสารและประกาศ — TICKET',
  description: 'ติดตามข่าวสาร ประกาศสำคัญ และข้อมูลความเคลื่อนไหวคอนเสิร์ตจาก TICKET',
};

export default async function NewsListPage() {
  let newsList: PublicNewsSummary[] = [];

  try {
    const pool = getDatabasePool();
    newsList = await listPublishedNews(pool);
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.warn('Unable to load public news:', error);
    }
  }

  const hasNews = newsList.length > 0;

  return (
    <article className="static-page news-page" aria-labelledby="news-title">
      <header className="static-header">
        <p className="eyebrow">TICKET / ข่าวสารและประกาศ</p>
        <h1 id="news-title">ข่าวสารและประกาศ</h1>
        <p className="intro">
          ติดตามข่าวสาร ความเคลื่อนไหว และประกาศสำคัญเกี่ยวกับงานคอนเสิร์ตบนระบบ TICKET
        </p>
      </header>

      {!hasNews ? (
        <section className="empty-catalog-card news-empty-card" aria-label="ยังไม่มีข่าวสาร">
          <TicketIcon className="empty-icon" />
          <h2>ยังไม่มีข่าวสารในขณะนี้</h2>
          <p>เมื่อมีประกาศหรือข่าวสารใหม่จากทีมงาน จะแสดงในหน้านี้</p>
          <Link href="/" className="primary-button button-link">
            กลับหน้าแรก
          </Link>
        </section>
      ) : (
        <section className="news-grid" aria-label="รายการข่าวสาร">
          {newsList.map(item => (
            <article key={item.id} className="news-card">
              <div className="news-card-body">
                <div className="news-card-meta">
                  <span className="news-date">
                    <CalendarIcon />
                    <time dateTime={item.publishedAt}>{formatDate(new Date(item.publishedAt))}</time>
                  </span>
                </div>
                <h2 className="news-card-title">
                  <Link href={`/news/${item.id}`}>{item.title}</Link>
                </h2>
                <p className="news-card-snippet">{item.snippet}</p>
              </div>
              <div className="news-card-footer">
                <Link href={`/news/${item.id}`} className="news-read-more">
                  <span>อ่านรายละเอียด</span>
                  <ChevronRightIcon />
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </article>
  );
}
