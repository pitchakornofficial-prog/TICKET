import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarIcon, ArrowLeftIcon, CheckCircleIcon } from '@/components/icons';
import { getDatabasePool } from '@/server/database';
import { getPublishedNewsById } from '@/server/news';
import { formatDate } from '@/lib/locale';

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let newsItem = null;

  try {
    const pool = getDatabasePool();
    newsItem = await getPublishedNewsById(pool, id);
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.warn('Unable to load news detail:', error);
    }
  }

  if (!newsItem) {
    notFound();
  }

  const paragraphs = newsItem.content.split('\n\n').filter(p => p.trim());

  return (
    <article className="static-page news-detail-page">
      <div className="news-back-nav">
        <Link href="/news" className="back-link">
          <ArrowLeftIcon />
          <span>กลับหน้ารายการข่าวสาร</span>
        </Link>
      </div>

      <header className="news-article-header">
        <p className="eyebrow">TICKET / ข่าวสารและประกาศ</p>
        <h1 className="news-article-title">{newsItem.title}</h1>
        <div className="news-article-meta">
          <span className="news-meta-item">
            <CalendarIcon />
            <time dateTime={newsItem.publishedAt}>
              เผยแพร่เมื่อ {formatDate(new Date(newsItem.publishedAt))}
            </time>
          </span>
          <span className="news-meta-item author-tag">
            <CheckCircleIcon />
            <span>โดย {newsItem.authorName}</span>
          </span>
        </div>
      </header>

      <div className="news-article-body">
        {paragraphs.map(para => (
          <p key={para.slice(0, 32)} className="news-paragraph">{para}</p>
        ))}
      </div>

      <footer className="news-article-footer">
        <div className="news-footer-box">
          <p>
            <strong>ต้องการสอบถามข้อมูลเพิ่มเติม?</strong><br />
            ติดต่อทีมงาน TICKET ได้ตลอดเวลาผ่านหน้า{' '}
            <Link href="/contact" className="inline-link">
              ติดต่อเรา
            </Link>
          </p>
        </div>
        <div className="news-bottom-action">
          <Link href="/news" className="secondary-button button-link">
            ดูข่าวสารทั้งหมด
          </Link>
        </div>
      </footer>
    </article>
  );
}
