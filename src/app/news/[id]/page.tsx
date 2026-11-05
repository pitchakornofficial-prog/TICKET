import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CalendarIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  MapPinIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';
import { FloatingBackToTop } from '@/components/floating-back-to-top';
import { getDatabasePool } from '@/server/database';
import { getPublishedNewsById, listPublishedNews } from '@/server/news';
import { formatDate, formatBaht } from '@/lib/locale';

interface RelatedConcertInfo {
  id: string;
  title: string;
  location: string;
  posterUrl: string | null;
  startingPrice?: number;
}

interface OtherArticleInfo {
  id: string;
  title: string;
  snippet: string;
  coverUrl?: string | null;
  category: string;
  publishedAt: string;
}

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let newsItem: {
    id: string;
    title: string;
    content: string;
    coverUrl: string | null;
    category?: string;
    publishedAt: string;
    authorName: string;
    relatedConcertTitle?: string;
  } | null = null;

  let pool: ReturnType<typeof getDatabasePool> | null = null;
  try {
    pool = getDatabasePool();
    const dbItem = await getPublishedNewsById(pool, id);
    if (dbItem) {
      newsItem = {
        ...dbItem,
        category: 'ข่าวสาร',
      };
    }
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.warn('Unable to load news detail:', error);
    }
  }

  if (!newsItem) {
    notFound();
  }

  // 1. Fetch Related Concert if this article is linked to an event (D-173)
  let relatedConcert: RelatedConcertInfo | null = null;
  if (pool && newsItem.relatedConcertTitle) {
    try {
      const concertRes = await pool.query<{
        id: string;
        title: string;
        location: string;
        posterUrl: string | null;
        startingPrice: string | number | null;
      }>(
        `SELECT e.id, e.title, e.location, e."posterUrl",
                COALESCE(MIN(tt.price), 0) as "startingPrice"
         FROM events e
         LEFT JOIN event_sessions es ON e.id = es."eventId" AND es.status = 'approved'
         LEFT JOIN ticket_types tt ON es.id = tt."sessionId"
         WHERE e.status = 'approved' AND (e.title ILIKE $1 OR $2 ILIKE ('%' || e.title || '%'))
         GROUP BY e.id, e.title, e.location, e."posterUrl"
         LIMIT 1`,
        [`%${newsItem.relatedConcertTitle.slice(0, 16)}%`, newsItem.title],
      );

      if (concertRes.rows.length > 0) {
        const row = concertRes.rows[0];
        relatedConcert = {
          id: row.id,
          title: row.title,
          location: row.location,
          posterUrl: row.posterUrl,
          startingPrice: Number(row.startingPrice) || undefined,
        };
      }
    } catch {
      // Non-blocking
    }
  }

  // 2. Fetch Other / Latest Articles for Continuous Reading (D-173)
  const otherArticles: OtherArticleInfo[] = [];
  try {
    if (pool) {
      const dbAll = await listPublishedNews(pool);
      for (const item of dbAll) {
        if (item.id !== newsItem.id && otherArticles.length < 3) {
          otherArticles.push({
            id: item.id,
            title: item.title,
            snippet: item.snippet,
            coverUrl: item.coverUrl,
            category: 'ข่าวสาร',
            publishedAt: item.publishedAt,
          });
        }
      }
    }
  } catch {
    // Non-blocking
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

      {newsItem.coverUrl && (
        <div className="news-detail-cover">
          {/* biome-ignore lint/performance/noImgElement: news detail cover */}
          <img
            src={newsItem.coverUrl}
            alt={`ภาพประกอบ ${newsItem.title}`}
            className="news-detail-cover-img"
          />
        </div>
      )}

      <header className="news-article-header">
        {newsItem.category && (
          <span className="news-category-pill">{newsItem.category}</span>
        )}
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

      {/* Actionable Concert Conversion Card (D-173) */}
      {relatedConcert && (
        <section className="news-related-concert-card" aria-label="คอนเสิร์ตที่เกี่ยวข้องกับข่าวนี้">
          <div className="news-related-concert-info">
            <div className="news-related-concert-eyebrow">คอนเสิร์ตที่เกี่ยวข้อง</div>
            <h3 className="news-related-concert-title">{relatedConcert.title}</h3>
            <div className="news-related-concert-meta">
              <span className="news-related-concert-loc">
                <MapPinIcon style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                <span>{relatedConcert.location}</span>
              </span>
              {relatedConcert.startingPrice ? (
                <span className="news-related-concert-price">
                  เริ่มต้น {formatBaht(relatedConcert.startingPrice)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="news-related-concert-action">
            <Link
              href={`/events/${relatedConcert.id}`}
              className="primary-button button-link news-related-concert-btn"
              id="news-related-concert-cta"
            >
              <span>ดูรอบการแสดงและซื้อบัตร</span>
              <ChevronRightIcon />
            </Link>
          </div>
        </section>
      )}

      <div className="news-article-body">
        {paragraphs.map(para => (
          <p key={para.slice(0, 32)} className="news-paragraph">
            {para}
          </p>
        ))}
      </div>

      {/* Related / Latest Articles Section (D-173) */}
      {otherArticles.length > 0 && (
        <section className="news-related-section" aria-labelledby="news-related-heading">
          <div className="news-related-header-wrap">
            <h2 id="news-related-heading" className="news-related-heading">
              ข่าวสารและประกาศอื่น ๆ ที่น่าสนใจ
            </h2>
            <Link href="/news" className="news-related-view-all">
              <span>ดูข่าวสารทั้งหมด</span>
              <ChevronRightIcon style={{ width: '15px', height: '15px' }} />
            </Link>
          </div>

          <div className="news-related-grid">
            {otherArticles.map(article => (
              <article key={article.id} className="news-related-card">
                <Link
                  href={`/news/${article.id}`}
                  className="news-related-card-cover-link"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <div className="news-related-card-cover-wrap">
                    {article.coverUrl ? (
                      // biome-ignore lint/performance/noImgElement: related article cover
                      <img
                        src={article.coverUrl}
                        alt={`ภาพข่าว ${article.title}`}
                        className="news-related-card-cover-img"
                        loading="lazy"
                      />
                    ) : (
                      <div className="news-card-cover-placeholder">
                        <TicketIcon />
                      </div>
                    )}
                  </div>
                </Link>

                <div className="news-related-card-body">
                  <div className="news-card-meta">
                    <span className="news-date">
                      <CalendarIcon />
                      <time dateTime={article.publishedAt}>
                        {formatDate(new Date(article.publishedAt))}
                      </time>
                    </span>
                  </div>
                  <h3 className="news-related-card-title">
                    <Link href={`/news/${article.id}`}>{article.title}</Link>
                  </h3>
                  <p className="news-related-card-snippet">{article.snippet}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="news-article-footer">
        <div className="news-footer-box">
          <p>
            <strong>ต้องการสอบถามข้อมูลเพิ่มเติม?</strong>
            <br />
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

      {/* Universal Floating Back-to-Top Button (D-172) */}
      <FloatingBackToTop testId="news-detail-back-to-top-btn" />
    </article>
  );
}
