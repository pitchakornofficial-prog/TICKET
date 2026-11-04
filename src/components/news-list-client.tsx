'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TicketIcon } from './ticket-icon';
import {
  CalendarIcon,
  ChevronRightIcon,
  SearchIcon,
  XMarkIcon,
} from './icons';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [timeframeFilter, setTimeframeFilter] = useState<TimeframeFilter>('all');
  const [sortBy, setSortBy] = useState<NewsSortOption>('newest');

  const filteredNews = useMemo(() => {
    let result = [...initialNews];

    // 1. Omni-search filter across title, snippet, category, and related concert
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(item => {
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchSnippet = item.snippet.toLowerCase().includes(q);
        const matchCategory = item.category.toLowerCase().includes(q);
        const matchRelated = item.relatedConcertTitle?.toLowerCase().includes(q);
        return matchTitle || matchSnippet || matchCategory || Boolean(matchRelated);
      });
    }

    // 2. Category filter
    if (selectedCategory !== 'all') {
      result = result.filter(item => {
        if (selectedCategory === 'concert') {
          return item.category.includes('คอนเสิร์ต');
        }
        if (selectedCategory === 'announcement') {
          return item.category.includes('ประกาศ');
        }
        if (selectedCategory === 'perk') {
          return item.category.includes('สิทธิพิเศษ') || item.category.includes('กิจกรรม');
        }
        if (selectedCategory === 'system') {
          return item.category.includes('ระบบ') || item.category.includes('อัปเดต');
        }
        return item.category === selectedCategory;
      });
    }

    // 3. Timeframe filter
    if (timeframeFilter !== 'all') {
      result = result.filter(item => isWithinTimeframe(item.publishedAt, timeframeFilter));
    }

    // 4. Sorting
    result.sort((a, b) => {
      const timeA = new Date(a.publishedAt).getTime();
      const timeB = new Date(b.publishedAt).getTime();
      return sortBy === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [initialNews, searchQuery, selectedCategory, timeframeFilter, sortBy]);

  const isFilteringActive =
    searchQuery.trim().length > 0 ||
    selectedCategory !== 'all' ||
    timeframeFilter !== 'all' ||
    sortBy !== 'newest';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setTimeframeFilter('all');
    setSortBy('newest');
  };

  const heroArticle = filteredNews.length > 0 ? filteredNews[0] : null;
  const gridArticles = filteredNews.length > 1 ? filteredNews.slice(1) : [];

  return (
    <div className="news-content-container">
      {/* Omni-Search & Multi-Dimensional Filter Toolbar (D-173) */}
      <section className="news-search-filter-toolbar" aria-label="ค้นหาและกรองข่าวสาร">
        {/* Search Input Box */}
        <div className="news-search-box">
          <SearchIcon className="news-search-icon" aria-hidden="true" />
          <input
            id="news-search-input"
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ค้นหาข่าวสาร ประกาศสำคัญ หรือชื่อคอนเสิร์ต..."
            className="news-search-input"
            aria-label="ค้นหาข่าวสาร"
          />
          {searchQuery && (
            <button
              type="button"
              className="news-search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="ล้างคำค้นหา"
            >
              <XMarkIcon style={{ width: '16px', height: '16px' }} />
            </button>
          )}
        </div>

        {/* Unified Secondary Row (D-174): Category Capsule Tabs (Left) + Search-Style Filter Controls (Right) */}
        <div className="news-toolbar-secondary-row">
          {/* Category Tabs: Exact Parity with Home Page .catalog-tabs / .catalog-tab-btn (D-175, D-176) */}
          <div className="catalog-tabs news-filter-pills" role="tablist" aria-label="เลือกหมวดหมู่ข่าวสาร">
            {CATEGORY_TABS.map(tab => {
              const isActive = selectedCategory === tab.id;
              const displayLabel =
                tab.id === 'all'
                  ? `${tab.label} (${initialNews.length})`
                  : tab.label;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`catalog-tab-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(tab.id)}
                  data-testid={`news-category-${tab.id}`}
                >
                  <span>{displayLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Filter Controls: Search Page Dropdown Style (Image 2, D-174, D-179) */}
          <div className="news-filter-controls-group">
            <div className="filter-group-item news-filter-field">
              <label htmlFor="news-timeframe-select" className="filter-label news-filter-label">
                <CalendarIcon className="filter-icon" />
                <span>ช่วงเวลา</span>
              </label>
              <select
                id="news-timeframe-select"
                value={timeframeFilter}
                onChange={e => setTimeframeFilter(e.target.value as TimeframeFilter)}
                className="filter-select news-select-input"
                aria-label="กรองช่วงเวลา"
              >
                {TIMEFRAME_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group-item news-filter-field">
              <label htmlFor="news-sort-select" className="filter-label news-filter-label">
                <span>จัดเรียงตาม</span>
              </label>
              <select
                id="news-sort-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as NewsSortOption)}
                className="filter-select news-select-input"
                aria-label="เรียงลำดับข่าวสาร"
              >
                <option value="newest">ข่าวล่าสุด</option>
                <option value="oldest">ข่าวแรกสุด</option>
              </select>
            </div>

            {isFilteringActive && (
              <div className="news-filter-reset-wrap">
                <button
                  type="button"
                  id="news-clear-filters-btn"
                  className="search-reset-filters-btn news-filter-reset-btn"
                  onClick={handleResetFilters}
                  title="ล้างการค้นหาและตัวกรองทั้งหมด"
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Area: Empty State OR Hero Article + Magazine Grid */}
      {filteredNews.length === 0 ? (
        <section
          className="empty-catalog-card news-empty-card"
          aria-label="ไม่พบข่าวสารที่ตรงกับการค้นหาหรือตัวกรอง"
        >
          <TicketIcon className="empty-icon" />
          <h2>ไม่พบข่าวสารที่ตรงกับเงื่อนไข</h2>
          <p>ลองปรับคำค้นหา หรือกดล้างตัวกรองเพื่อดูข่าวสารและประกาศทั้งหมดของ TICKET</p>
          <button
            type="button"
            className="primary-button button-link"
            onClick={handleResetFilters}
          >
            ล้างการค้นหาและตัวกรองทั้งหมด
          </button>
        </section>
      ) : (
        <>
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
        </>
      )}

      {/* Universal Floating Back-to-Top Button (D-172) */}
      <FloatingBackToTop testId="news-back-to-top-btn" />
    </div>
  );
}
