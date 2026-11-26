'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { TicketIcon } from './ticket-icon';
import { CalendarIcon, ChevronRightIcon } from './icons';
import { FloatingBackToTop } from './floating-back-to-top';
import { formatDate } from '../lib/locale';

export interface NewsItemDisplay {
  id: string;
  title: string;
  snippet: string;
  coverUrl?: string;
  category: string;
  publishedAt: string;
  relatedConcertTitle?: string;
}

export type TimeframeFilter = 'all' | 'today' | 'week' | 'month' | 'year';
export type NewsSortOption = 'newest' | 'oldest';

export const TIMEFRAME_OPTIONS: { id: TimeframeFilter; label: string }[] = [
  { id: 'all', label: 'ทุกช่วงเวลา' },
  { id: 'today', label: 'วันนี้' },
  { id: 'week', label: 'อาทิตย์นี้' },
  { id: 'month', label: 'เดือนนี้' },
  { id: 'year', label: 'ปีนี้' },
];

export const CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'concert', label: 'คอนเสิร์ต' },
  { id: 'announcement', label: 'ประกาศสำคัญ' },
  { id: 'perk', label: 'กิจกรรมและสิทธิพิเศษ' },
  { id: 'system', label: 'อัปเดตระบบ' },
];

/**
 * Check whether a published ISO date string falls into the given timeframe
 * relative to the current local date (Asia/Bangkok timezone).
 */
export function isWithinTimeframe(publishedAtIso: string, filter: TimeframeFilter): boolean {
  if (filter === 'all') return true;

  const published = new Date(publishedAtIso);
  if (Number.isNaN(published.getTime())) return false;

  const now = new Date();

  // "Today": Same calendar day, month, and year
  if (filter === 'today') {
    return (
      published.getFullYear() === now.getFullYear() &&
      published.getMonth() === now.getMonth() &&
      published.getDate() === now.getDate()
    );
  }

  // "This week": Past 7 calendar days up to end of today, or current calendar week
  if (filter === 'week') {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    return published >= sevenDaysAgo && published <= now;
  }

  // "This month": Same month and year
  if (filter === 'month') {
    return (
      published.getFullYear() === now.getFullYear() &&
      published.getMonth() === now.getMonth()
    );
  }

  // "This year": Same year
  if (filter === 'year') {
    return published.getFullYear() === now.getFullYear();
  }

  return true;
}

interface NewsListClientProps {
  initialNews: NewsItemDisplay[];
}

export function NewsListClient({ initialNews }: NewsListClientProps) {
  const sortedNews = useMemo(() => {
    return [...initialNews].sort((a, b) => {
      const timeA = new Date(a.publishedAt).getTime();
      const timeB = new Date(b.publishedAt).getTime();
      return timeB - timeA;
    });
  }, [initialNews]);

  const heroArticle = sortedNews.length > 0 ? sortedNews[0] : null;
  const gridArticles = sortedNews.length > 1 ? sortedNews.slice(1) : [];

  if (sortedNews.length === 0) {
    return (
      <div className="news-content-container">
        <section
          className="news-empty-container"
          style={{
            textAlign: 'center',
            padding: '4rem 1rem',
            color: 'var(--muted, #64748b)',
          }}
        >
          <TicketIcon style={{ width: '48px', height: '48px', margin: '0 auto 1rem', opacity: 0.4 }} />
          <p style={{ fontSize: '1.05rem', margin: 0 }}>ขณะนี้ยังไม่มีประกาศหรือข่าวสารใหม่</p>
        </section>
      </div>
    );
  }

  return (
    <div className="news-content-container">
      {/* 1. Hero Highlight Article (D-173) */}
      {heroArticle && (
            <article className="news-hero-card" aria-label={`ข่าวเด่น: ${heroArticle.title}`}>
              <Link
                href={`/news/${heroArticle.id}`}
                className="news-hero-cover-link"
                tabIndex={-1}
                aria-hidden="true"
              >
                <div className="news-hero-cover-wrap">
                  {heroArticle.coverUrl ? (
                    // biome-ignore lint/performance/noImgElement: hero magazine cover image
                    <img
                      src={heroArticle.coverUrl}
                      alt={`ภาพประกอบข่าวเด่น ${heroArticle.title}`}
                      className="news-hero-cover-img"
                    />
                  ) : (
                    <div className="news-card-cover-placeholder">
                      <TicketIcon />
                    </div>
                  )}
                </div>
              </Link>

              <div className="news-hero-body">
                <div className="news-card-meta">
                  <span className="news-date">
                    <CalendarIcon />
                    <time dateTime={heroArticle.publishedAt}>
                      {formatDate(new Date(heroArticle.publishedAt))}
                    </time>
                  </span>
                  {heroArticle.relatedConcertTitle && (
                    <span className="news-hero-concert-badge">
                      {heroArticle.relatedConcertTitle}
                    </span>
                  )}
                </div>

                <h2 className="news-hero-title">
                  <Link href={`/news/${heroArticle.id}`}>{heroArticle.title}</Link>
                </h2>

                <p className="news-hero-snippet">{heroArticle.snippet}</p>

                <div className="news-hero-footer">
                  <Link
                    href={`/news/${heroArticle.id}`}
                    className="primary-button button-link news-hero-cta-btn"
                    aria-label={`อ่านรายละเอียดข่าวเด่น: ${heroArticle.title}`}
                  >
                    <span>อ่านรายละเอียดข่าวนี้</span>
                    <ChevronRightIcon />
                  </Link>
                </div>
              </div>
            </article>
          )}

          {/* 2. Secondary Magazine Grid (D-70) */}
          {gridArticles.length > 0 && (
            <div className="news-secondary-section">
              <div className="news-grid-section-header">
                <h3 className="news-grid-heading">ข่าวสารและประกาศอื่น ๆ</h3>
                <span className="news-grid-count">({gridArticles.length} ข่าว)</span>
              </div>

              <section className="news-magazine-grid" aria-label="รายการข่าวสาร">
                {gridArticles.map(item => (
                  <article key={item.id} className="news-magazine-card">
                    {/* Cover Image & Category Tag */}
                    <Link
                      href={`/news/${item.id}`}
                      className="news-card-cover-link"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <div className="news-card-cover-wrap">
                        {item.coverUrl ? (
                          // biome-ignore lint/performance/noImgElement: magazine cover image
                          <img
                            src={item.coverUrl}
                            alt={`ภาพประกอบข่าว ${item.title}`}
                            className="news-card-cover-img"
                            loading="lazy"
                          />
                        ) : (
                          <div className="news-card-cover-placeholder">
                            <TicketIcon />
                          </div>
                        )}
                      </div>
                    </Link>

                    <div className="news-card-body">
                      <div className="news-card-meta">
                        <span className="news-date">
                          <CalendarIcon />
                          <time dateTime={item.publishedAt}>
                            {formatDate(new Date(item.publishedAt))}
                          </time>
                        </span>
                        {item.relatedConcertTitle && (
                          <span className="news-card-concert-subtag">
                            {item.relatedConcertTitle}
                          </span>
                        )}
                      </div>
                      <h2 className="news-card-title">
                        <Link href={`/news/${item.id}`}>{item.title}</Link>
                      </h2>
                      <p className="news-card-snippet">{item.snippet}</p>
                    </div>

                    <div className="news-card-footer">
                      <Link
                        href={`/news/${item.id}`}
                        className="news-read-more"
                        aria-label={`อ่านรายละเอียดข่าว: ${item.title}`}
                      >
                        <span>อ่านรายละเอียด</span>
                        <ChevronRightIcon />
                      </Link>
                    </div>
                  </article>
                ))}
              </section>
            </div>
          )}

      {/* Universal Floating Back-to-Top Button (D-172) */}
      <FloatingBackToTop testId="news-back-to-top-btn" />
    </div>
  );
}
