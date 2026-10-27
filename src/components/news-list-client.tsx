'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TicketIcon } from './ticket-icon';
import { CalendarIcon, ChevronRightIcon } from './icons';
import { formatDate } from '../lib/locale';

export interface NewsItemDisplay {
  id: string;
  title: string;
  snippet: string;
  coverUrl?: string;
  category: string;
  publishedAt: string;
}

export type TimeframeFilter = 'all' | 'today' | 'week' | 'month' | 'year';

interface NewsListClientProps {
  initialNews: NewsItemDisplay[];
}

const TIMEFRAME_OPTIONS: { id: TimeframeFilter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'today', label: 'วันนี้' },
  { id: 'week', label: 'อาทิตย์นี้' },
  { id: 'month', label: 'เดือนนี้' },
  { id: 'year', label: 'ปีนี้' },
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
    // Current week starting from Monday (or past 7 days)
    // To give users an intuitive experience, we check if within the last 7 full days
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

export function NewsListClient({ initialNews }: NewsListClientProps) {
  const [activeFilter, setActiveFilter] = useState<TimeframeFilter>('all');

  const filteredNews = useMemo(() => {
    return initialNews.filter(item => isWithinTimeframe(item.publishedAt, activeFilter));
  }, [initialNews, activeFilter]);

  return (
    <div className="news-content-container">
      {/* Timeframe Filter Pills Toolbar (D-71) */}
      <section className="news-filter-toolbar" aria-label="ตัวกรองช่วงเวลาข่าวสาร">
        <div className="news-filter-pills" role="tablist" aria-label="เลือกช่วงเวลา">
          {TIMEFRAME_OPTIONS.map(opt => {
            const isActive = activeFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`news-filter-pill ${isActive ? 'active' : ''}`}
                onClick={() => setActiveFilter(opt.id)}
                data-testid={`news-filter-${opt.id}`}
              >
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="news-filter-count-badge" aria-live="polite">
          <span>พบ {filteredNews.length} ข่าว</span>
          {activeFilter !== 'all' && (
            <button
              type="button"
              className="news-filter-reset-btn"
              onClick={() => setActiveFilter('all')}
              title="ล้างตัวกรอง"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </section>

      {/* News Grid or Empty State */}
      {filteredNews.length === 0 ? (
        <section
          className="empty-catalog-card news-empty-card"
          aria-label="ไม่พบข่าวสารในช่วงเวลานี้"
        >
          <TicketIcon className="empty-icon" />
          <h2>ไม่พบข่าวสารในช่วงเวลาที่เลือก</h2>
          <p>ลองเลือกช่วงเวลาอื่น หรือกดดูข่าวสารทั้งหมดเพื่อติดตามอัปเดตล่าสุด</p>
          <button
            type="button"
            className="primary-button button-link"
            onClick={() => setActiveFilter('all')}
          >
            ดูข่าวสารทั้งหมด
          </button>
        </section>
      ) : (
        <section className="news-magazine-grid" aria-label="รายการข่าวสาร">
          {filteredNews.map(item => (
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
                    /* biome-ignore lint/performance/noImgElement: magazine cover image */
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
                  <span className="news-card-category-badge">{item.category}</span>
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
      )}
    </div>
  );
}
