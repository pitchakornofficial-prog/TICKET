'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TicketIcon } from './ticket-icon';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from './icons';
import { formatBaht } from '@/lib/locale';
import type { PublicEventSummary } from '@/server/events';

interface HomeConcertCatalogProps {
  allEvents: PublicEventSummary[];
  initialQuery?: string;
}

type FilterTab = 'all' | 'available' | 'upcoming';

export function HomeConcertCatalog({
  allEvents,
  initialQuery = '',
}: HomeConcertCatalogProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state with browser navigation (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setQuery(params.get('q') || '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Listen to instant search keystroke broadcasts from NavbarSearch
  useEffect(() => {
    const handleSearchEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setQuery(customEvent.detail || '');
    };

    window.addEventListener('ticket:search', handleSearchEvent);
    return () => {
      window.removeEventListener('ticket:search', handleSearchEvent);
    };
  }, []);

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = Boolean(trimmedQuery);

  // Upcoming concerts for the wide image banner carousel
  const upcomingEvents = [...allEvents].sort((a, b) => {
    return new Date(a.earliestStartTime).getTime() - new Date(b.earliestStartTime).getTime();
  });

  const totalSlides = upcomingEvents.length;

  const nextSlide = useCallback(() => {
    if (totalSlides > 1) {
      setCurrentSlide(prev => (prev + 1) % totalSlides);
    }
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    if (totalSlides > 1) {
      setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides);
    }
  }, [totalSlides]);

  // Auto-advance banner every 6 seconds when not searching and not hovered
  useEffect(() => {
    if (isSearching || totalSlides <= 1 || isPaused) {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
      return;
    }

    autoPlayTimerRef.current = setInterval(() => {
      nextSlide();
    }, 6000);

    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    };
  }, [isSearching, totalSlides, isPaused, nextSlide]);

  // Filter events by search query
  const searchFilteredEvents = isSearching
    ? allEvents.filter(
        ev =>
          ev.title.toLowerCase().includes(trimmedQuery) ||
          ev.location.toLowerCase().includes(trimmedQuery) ||
          Boolean(ev.description?.toLowerCase().includes(trimmedQuery)),
      )
    : allEvents;

  // Tab filtering for general catalog
  const catalogEvents = searchFilteredEvents.filter(ev => {
    if (isSearching || filterTab === 'all') return true;
    const eventDate = new Date(ev.earliestStartTime).getTime();
    const now = Date.now();
    if (filterTab === 'available') {
      return ev.totalQuota > 0;
    }
    if (filterTab === 'upcoming') {
      return eventDate > now;
    }
    return true;
  });

  const handleClearSearch = () => {
    setQuery('');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ticket:search', { detail: '' }));
    }
    router.replace('/', { scroll: false });
  };

  const activeEvent = upcomingEvents[currentSlide] || null;

  return (
    <div className="home-container">
      {/* 1. When NOT searching: Display Pure Wide Graphic Banner Carousel (D-28) */}
      {!isSearching && totalSlides > 0 && activeEvent && (
        <section
          className="upcoming-banner-section"
          aria-label="แบนเนอร์คอนเสิร์ตที่จะมาถึง"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="banner-carousel-container">
            {/* The entire banner is a clickable link directly into the concert's detail page */}
            <Link
              href={`/events/${activeEvent.id}`}
              className="banner-slide-link"
              aria-label={`ดูรายละเอียดและจองบัตรคอนเสิร์ต ${activeEvent.title}`}
            >
              {activeEvent.posterUrl ? (
                /* biome-ignore lint/performance/noImgElement: wide panoramic banner image */
                <img
                  src={activeEvent.posterUrl}
                  alt={`แบนเนอร์คอนเสิร์ต ${activeEvent.title}`}
                  className="banner-image"
                />
              ) : (
                /* Pure Panoramic stage artwork without ANY text overlay (D-28: เหลือแค่รูป) */
                <div className="banner-graphic-card">
                  <div className="banner-graphic-bg" aria-hidden="true" />
                  <div className="banner-graphic-glow" aria-hidden="true" />
                </div>
              )}
            </Link>

            {/* Carousel Navigation Arrows (When > 1 event) */}
            {totalSlides > 1 && (
              <>
                <button
                  type="button"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    prevSlide();
                  }}
                  className="carousel-arrow carousel-arrow-prev"
                  aria-label="แบนเนอร์คอนเสิร์ตก่อนหน้า"
                >
                  <ChevronLeftIcon />
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    nextSlide();
                  }}
                  className="carousel-arrow carousel-arrow-next"
                  aria-label="แบนเนอร์คอนเสิร์ตถัดไป"
                >
                  <ChevronRightIcon />
                </button>

                {/* Pagination Dots */}
                <div className="carousel-dots-bar" role="tablist" aria-label="เลือกลำดับแบนเนอร์คอนเสิร์ต">
                  {upcomingEvents.map((ev, index) => (
                    <button
                      key={ev.id}
                      type="button"
                      role="tab"
                      aria-selected={index === currentSlide}
                      aria-label={`แบนเนอร์คอนเสิร์ตลำดับที่ ${index + 1}: ${ev.title}`}
                      className={`carousel-dot ${index === currentSlide ? 'active' : ''}`}
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCurrentSlide(index);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* 2. When SEARCHING: Live Search Results Notice Bar */}
      {isSearching && (
        <section className="search-results-bar" aria-label="ผลการค้นหา">
          <div className="search-results-info">
            <h2>ผลการค้นหาสำหรับ &ldquo;{query}&rdquo;</h2>
            <p>พบทั้งหมด {searchFilteredEvents.length} รายการ</p>
          </div>
          <button
            type="button"
            onClick={handleClearSearch}
            className="secondary-button button-link clear-search-button"
          >
            ล้างคำค้นหา
          </button>
        </section>
      )}

      {/* Empty Search Result State */}
      {isSearching && searchFilteredEvents.length === 0 && (
        <section className="empty-catalog-section" aria-label="ไม่พบรายการคอนเสิร์ต">
          <div className="empty-catalog-card">
            <TicketIcon className="empty-icon" />
            <h2>ไม่พบคอนเสิร์ตที่ตรงกับคำค้นหา</h2>
            <p>กรุณาลองค้นหาด้วยชื่อคอนเสิร์ต ศิลปิน หรือสถานที่จัดงาน</p>
            <button
              type="button"
              onClick={handleClearSearch}
              className="primary-button button-link"
              style={{ marginTop: '1rem' }}
            >
              ดูคอนเสิร์ตทั้งหมด
            </button>
          </div>
        </section>
      )}

      {/* 3. General Concert Catalog: Horizontal Scroll Row with 4:5 Poster Cards (D-30) */}
      <section className="catalog-section" aria-labelledby="catalog-heading">
        <div className="catalog-header-bar">
          <div className="section-title-wrap" style={{ marginBottom: 0 }}>
            <h2 id="catalog-heading" className="section-title">
              {isSearching ? `ผลการค้นหา (${searchFilteredEvents.length})` : 'คอนเสิร์ตทั้งหมด'}
            </h2>
            <span className="section-subtitle">
              เลือกชมรอบการแสดงและสั่งซื้อบัตรเข้าชมได้ทันทีโดยไม่ต้องสมัครสมาชิก
            </span>
          </div>

          {/* Filter Tabs (Visible when not searching) */}
          {!isSearching && (
            <div className="catalog-tabs" role="tablist" aria-label="กรองคอนเสิร์ตตามสถานะ">
              <button
                type="button"
                role="tab"
                aria-selected={filterTab === 'all'}
                className={`catalog-tab-btn ${filterTab === 'all' ? 'active' : ''}`}
                onClick={() => setFilterTab('all')}
              >
                ทั้งหมด ({allEvents.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterTab === 'available'}
                className={`catalog-tab-btn ${filterTab === 'available' ? 'active' : ''}`}
                onClick={() => setFilterTab('available')}
              >
                เปิดจำหน่ายแล้ว
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterTab === 'upcoming'}
                className={`catalog-tab-btn ${filterTab === 'upcoming' ? 'active' : ''}`}
                onClick={() => setFilterTab('upcoming')}
              >
                เร็ว ๆ นี้
              </button>
            </div>
          )}
        </div>

        {/* Empty Filter State */}
        {!isSearching && catalogEvents.length === 0 && (
          <div className="empty-filter-box">
            <TicketIcon />
            <p>ยังไม่มีรายการคอนเสิร์ตในหมวดหมู่นี้</p>
          </div>
        )}

        {/* Horizontal Scrollable Row for 4:5 Poster Cards (D-30, D-32) */}
        {catalogEvents.length > 0 && (
          <div className="concert-row-wrapper">
            <div className="concert-scroll-track">
              {catalogEvents.map(event => (
                <article key={event.id} className="concert-card-split">
                  <Link
                    href={`/events/${event.id}`}
                    className="card-split-link"
                    aria-label={`คอนเสิร์ต ${event.title}`}
                  >
                    {/* Top Compartment: 4:5 Poster Image Frame */}
                    <div className="card-split-poster-frame">
                      {event.posterUrl ? (
                        /* biome-ignore lint/performance/noImgElement: concert poster 4:5 */
                        <img
                          src={event.posterUrl}
                          alt={`โปสเตอร์ ${event.title}`}
                          className="card-split-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="card-split-placeholder">
                          <TicketIcon />
                          <span>LIVE CONCERT</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Compartment: White Information Box (D-30) */}
                    <div className="card-split-info-box">
                      <h3 className="card-split-title">{event.title}</h3>

                      <div className="card-split-footer">
                        <div className="card-split-price">
                          <span className="price-label">ราคาบัตร</span>
                          <span className="price-amount">
                            {event.startingPrice > 0
                              ? `เริ่มต้น ${formatBaht(event.startingPrice)}`
                              : 'ฟรี'}
                          </span>
                        </div>
                        <span className="card-split-buy-btn">
                          ซื้อบัตร
                        </span>
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
