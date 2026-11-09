'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TicketIcon } from './ticket-icon';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
} from './icons';
// Note: ChevronUpIcon previously used for Back-to-Top (D-143), unified with organizer arrow (D-172)
import { formatBahtCompact } from '@/lib/locale';
import type { PublicEventSummary } from '@/server/events';
import {
  loadHomeBanners,
  isBannerScheduleActive,
  EVENT_HOME_BANNERS_CHANGED,
  type HeroBannerItem,
} from '@/lib/home-banners-sync';

interface HomeConcertCatalogProps {
  allEvents: PublicEventSummary[];
  initialQuery?: string;
}

type FilterTab = 'all' | 'available' | 'upcoming';
type PriceRange = 'all' | 'under1500' | '1500to3000' | 'above3000';
type SortOrder = 'date_asc' | 'price_asc' | 'price_desc';
type SearchAvailability = 'all' | 'available' | 'upcoming';

const BATCH_SIZE = 12;

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

  // Search Filters state (D-69)
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [priceRange, setPriceRange] = useState<PriceRange>('all');
  const [availability, setAvailability] = useState<SearchAvailability>('all');
  const [sortBy, setSortBy] = useState<SortOrder>('date_asc');

  // Batched Infinite Scroll & Back-to-Top State (D-143)
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const searchSentinelRef = useRef<HTMLDivElement | null>(null);
  const catalogSentinelRef = useRef<HTMLDivElement | null>(null);

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

  // Available locations extracted from all events
  const availableLocations = useMemo(() => {
    const locSet = new Set<string>();
    for (const ev of allEvents) {
      if (ev.location?.trim()) {
        locSet.add(ev.location.trim());
      }
    }
    return Array.from(locSet).sort((a, b) => a.localeCompare(b, 'th'));
  }, [allEvents]);

  // Configured Hero Banners from Store (Q1A, Q2A, Q3A, Q4A)
  const [configuredBanners, setConfiguredBanners] = useState<HeroBannerItem[]>(() => loadHomeBanners());

  useEffect(() => {
    const handleBannersChanged = (e: Event) => {
      const customEvent = e as CustomEvent<HeroBannerItem[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setConfiguredBanners(customEvent.detail);
      } else {
        setConfiguredBanners(loadHomeBanners());
      }
    };
    window.addEventListener(EVENT_HOME_BANNERS_CHANGED, handleBannersChanged);
    return () => window.removeEventListener(EVENT_HOME_BANNERS_CHANGED, handleBannersChanged);
  }, []);

  // Filter only active & scheduled banners
  const activeBanners = useMemo(() => {
    return configuredBanners
      .filter(banner => isBannerScheduleActive(banner))
      .sort((a, b) => a.order - b.order);
  }, [configuredBanners]);

  // Upcoming concerts for fallback when no custom banner is active
  const upcomingEvents = useMemo(() => {
    return [...allEvents].sort((a, b) => {
      return new Date(a.earliestStartTime).getTime() - new Date(b.earliestStartTime).getTime();
    });
  }, [allEvents]);

  // Unified banner slides list
  const bannerSlides = useMemo(() => {
    if (activeBanners.length > 0) {
      return activeBanners.map(b => {
        const linkedEvent = b.eventId ? allEvents.find(e => e.id === b.eventId) : undefined;
        let targetUrl: string | null = null;
        if (b.linkType === 'concert') {
          targetUrl = b.eventId ? `/events/${b.eventId}` : (linkedEvent ? `/events/${linkedEvent.id}` : '#');
        } else if (b.linkType === 'custom_url') {
          targetUrl = b.customUrl || '#';
        }

        return {
          id: b.id,
          title: b.title || 'คอนเสิร์ตเด่น',
          imageUrl: b.imageUrl || linkedEvent?.posterUrl || '',
          targetUrl,
          isClickable: b.linkType !== 'none' && Boolean(targetUrl && targetUrl !== '#'),
        };
      });
    }

    // Default fallback: display upcoming concerts
    return upcomingEvents.map(ev => ({
      id: ev.id,
      title: ev.title,
      subtitle: `${ev.location || 'สถานที่จัดงาน'} • เริ่มต้น ${formatBahtCompact(ev.startingPrice)}`,
      imageUrl: ev.posterUrl || '',
      targetUrl: `/events/${ev.id}`,
      ctaText: 'จองบัตรเลย',
      isClickable: true,
    }));
  }, [activeBanners, upcomingEvents, allEvents]);

  const totalSlides = bannerSlides.length;

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

  // 1. Filter events by search query text
  const textFilteredEvents = useMemo(() => {
    if (!isSearching) return allEvents;
    return allEvents.filter(
      ev =>
        ev.title.toLowerCase().includes(trimmedQuery) ||
        ev.location.toLowerCase().includes(trimmedQuery) ||
        Boolean(ev.description?.toLowerCase().includes(trimmedQuery)),
    );
  }, [allEvents, isSearching, trimmedQuery]);

  // 2. Extra Search Filters (Location, Price Range, Availability) (D-69)
  const searchFilteredEvents = useMemo(() => {
    if (!isSearching) return textFilteredEvents;

    return textFilteredEvents.filter(ev => {
      // Location Filter
      if (selectedLocation !== 'all' && ev.location?.trim() !== selectedLocation) {
        return false;
      }

      // Price Range Filter
      if (priceRange === 'under1500' && ev.startingPrice > 1500) {
        return false;
      }
      if (priceRange === '1500to3000' && (ev.startingPrice <= 1500 || ev.startingPrice > 3000)) {
        return false;
      }
      if (priceRange === 'above3000' && ev.startingPrice <= 3000) {
        return false;
      }

      // Availability Filter
      const eventDate = new Date(ev.earliestStartTime).getTime();
      const now = Date.now();
      if (availability === 'available' && ev.totalQuota <= 0) {
        return false;
      }
      if (availability === 'upcoming' && eventDate <= now) {
        return false;
      }

      return true;
    });
  }, [textFilteredEvents, isSearching, selectedLocation, priceRange, availability]);

  // 3. Sorting search results
  const sortedSearchEvents = useMemo(() => {
    const list = [...searchFilteredEvents];
    if (sortBy === 'price_asc') {
      return list.sort((a, b) => a.startingPrice - b.startingPrice);
    }
    if (sortBy === 'price_desc') {
      return list.sort((a, b) => b.startingPrice - a.startingPrice);
    }
    return list.sort((a, b) => new Date(a.earliestStartTime).getTime() - new Date(b.earliestStartTime).getTime());
  }, [searchFilteredEvents, sortBy]);

  // Tab filtering for general catalog (when not searching)
  const catalogEvents = useMemo(() => {
    if (filterTab === 'all') return allEvents;
    const now = Date.now();
    return allEvents.filter(ev => {
      const eventDate = new Date(ev.earliestStartTime).getTime();
      if (filterTab === 'available') {
        return ev.totalQuota > 0;
      }
      if (filterTab === 'upcoming') {
        return eventDate > now;
      }
      return true;
    });
  }, [allEvents, filterTab]);

  const handleResetFilters = () => {
    setSelectedLocation('all');
    setPriceRange('all');
    setAvailability('all');
    setSortBy('date_asc');
  };

  const handleClearSearch = () => {
    setQuery('');
    handleResetFilters();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ticket:search', { detail: '' }));
    }
    router.replace('/', { scroll: false });
  };

  const isFilterActive =
    selectedLocation !== 'all' ||
    priceRange !== 'all' ||
    availability !== 'all' ||
    sortBy !== 'date_asc';

  // Reset visibleCount on filter or search query changes (D-143)
  const filterKey = `${trimmedQuery}:${filterTab}:${selectedLocation}:${priceRange}:${availability}:${sortBy}`;
  useEffect(() => {
    if (filterKey) {
      setVisibleCount(BATCH_SIZE);
    }
  }, [filterKey]);

  // Monitor scroll position for Floating Back-to-Top Button (D-143)
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // IntersectionObserver for Infinite Scroll batch loading (D-143)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const activeSentinel = isSearching
      ? searchSentinelRef.current
      : catalogSentinelRef.current;
    if (!activeSentinel) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount(prev => prev + BATCH_SIZE);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(activeSentinel);
    return () => observer.disconnect();
  }, [isSearching]);

  const activeSlide = bannerSlides[currentSlide] || null;

  return (
    <div className="home-container">
      {/* ========================================================
          MODE 1: WHEN NOT SEARCHING (Normal Showroom Homepage)
          ======================================================== */}
      {!isSearching && (
        <>
          {/* Pure Wide Graphic Banner Carousel (D-28, Q1A, Q3A) */}
          {totalSlides > 0 && activeSlide && (
            <section
              className="upcoming-banner-section"
              aria-label="แบนเนอร์คอนเสิร์ตเด่นหน้าแรก"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
            >
              <div className="banner-carousel-container">
                <div className="banner-fade-track">
                  {bannerSlides.map((slide, index) => {
                    const isActive = index === currentSlide;
                    const SlideContent = slide.imageUrl ? (
                      /* biome-ignore lint/performance/noImgElement: wide panoramic banner */
                      <img
                        src={slide.imageUrl}
                        alt={`แบนเนอร์ ${slide.title || 'คอนเสิร์ต'}`}
                        className="banner-image"
                        loading={index === 0 ? 'eager' : 'lazy'}
                      />
                    ) : (
                      <div className="banner-graphic-card">
                        <div className="banner-graphic-bg" />
                        <div className="banner-graphic-glow" />
                      </div>
                    );

                    if (slide.isClickable && slide.targetUrl) {
                      return (
                        <Link
                          key={slide.id}
                          href={slide.targetUrl}
                          className={`banner-slide-link ${isActive ? 'banner-slide-active' : 'banner-slide-inactive'}`}
                          aria-label={`ดูรายละเอียด ${slide.title}`}
                          tabIndex={isActive ? 0 : -1}
                          aria-hidden={!isActive}
                        >
                          {SlideContent}
                        </Link>
                      );
                    }

                    return (
                      <div
                        key={slide.id}
                        className={`banner-slide-link banner-slide-static ${isActive ? 'banner-slide-active' : 'banner-slide-inactive'}`}
                        tabIndex={-1}
                        aria-hidden={!isActive}
                      >
                        {SlideContent}
                      </div>
                    );
                  })}
                </div>

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
                      aria-label="แบนเนอร์ก่อนหน้า"
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
                      aria-label="แบนเนอร์ถัดไป"
                    >
                      <ChevronRightIcon />
                    </button>

                    <div className="carousel-dots-bar" role="tablist" aria-label="เลือกลำดับแบนเนอร์">
                      {bannerSlides.map((slide, index) => (
                        <button
                          key={slide.id}
                          type="button"
                          role="tab"
                          aria-selected={index === currentSlide}
                          aria-label={`แบนเนอร์ลำดับที่ ${index + 1}: ${slide.title}`}
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

          {/* Section Divider between Banner & Catalog (D-192) */}
          <hr className="catalog-section-divider" />

          {/* General Concert Catalog: Horizontal Scroll Row with 4:5 Poster Cards (D-30, D-32) */}
          <section className="catalog-section" aria-labelledby="catalog-heading">
            <div className="catalog-header-bar">
              <div className="section-title-wrap" style={{ marginBottom: 0 }}>
                <h2 id="catalog-heading" className="section-title">
                  คอนเสิร์ตทั้งหมด
                </h2>
                <span className="section-subtitle">
                  เลือกชมรอบการแสดงและสั่งซื้อบัตรเข้าชมได้ทันทีโดยไม่ต้องสมัครสมาชิก
                </span>
              </div>

              {/* Filter Tabs */}
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
            </div>

            {catalogEvents.length === 0 ? (
              <div className="empty-filter-box">
                <TicketIcon />
                <p>ยังไม่มีรายการคอนเสิร์ตในหมวดหมู่นี้</p>
              </div>
            ) : (
              <div className="catalog-grid-wrapper">
                <div className="catalog-events-grid">
                  {catalogEvents.slice(0, visibleCount).map(event => (
                    <article key={event.id} className="concert-card-split catalog-card-item">
                      <Link
                        href={`/events/${event.id}`}
                        className="card-split-link"
                        aria-label={`คอนเสิร์ต ${event.title}`}
                      >
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

                        <div className="card-split-info-box">
                          <h3 className="card-split-title">{event.title}</h3>
                          <div className="card-split-location-line">
                            <MapPinIcon className="card-location-icon" />
                            <span>{event.location}</span>
                          </div>

                          <div className="card-split-footer">
                            <div className="card-split-price">
                              <span className="price-amount">
                                {event.startingPrice > 0
                                  ? `ราคาเริ่มต้น ${formatBahtCompact(event.startingPrice)}`
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

                {visibleCount < catalogEvents.length ? (
                  <div
                    ref={catalogSentinelRef}
                    className="infinite-scroll-sentinel"
                    aria-hidden="true"
                  />
                ) : (
                  catalogEvents.length > BATCH_SIZE && (
                    <p className="all-events-loaded-msg">
                      ท่านได้ดูรายการคอนเสิร์ตทั้งหมดแล้ว
                    </p>
                  )
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* ========================================================
          MODE 2: WHEN SEARCHING (Unified Clean Results & Filter Engine) (D-69)
          ======================================================== */}
      {isSearching && (
        <section className="search-results-section" aria-label="ผลการค้นหาคอนเสิร์ต">
          {/* Unified Clean Header (No duplicate headings) */}
          <div className="search-results-bar">
            <div className="search-results-info">
              <div className="search-results-title-row">
                <h1 className="search-results-heading">
                  ผลการค้นหาสำหรับ &ldquo;<span className="search-results-query">{query}</span>&rdquo;
                </h1>
                <span className="search-count-badge">
                  พบ {searchFilteredEvents.length} คอนเสิร์ต
                </span>
              </div>
              <p className="search-results-sub">
                ค้นหาและกรองคอนเสิร์ตตามสถานที่ งบประมาณราคา และสถานะรอบการแสดง
              </p>
            </div>

            <div className="search-actions-bar">
              {isFilterActive && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="search-reset-filters-btn"
                >
                  รีเซ็ตตัวกรอง
                </button>
              )}
              <button
                type="button"
                onClick={handleClearSearch}
                className="secondary-button button-link clear-search-button"
              >
                ล้างคำค้นหา
              </button>
            </div>
          </div>

          {/* Comprehensive Filter Toolbar (Location, Price, Status, Sort) */}
          <section className="search-filters-toolbar" aria-label="ตัวกรองและเรียงลำดับการค้นหา">
            {/* Location Filter */}
            <div className="filter-group-item">
              <label htmlFor="search-location-select" className="filter-label">
                <MapPinIcon className="filter-icon" />
                สถานที่จัดงาน
              </label>
              <select
                id="search-location-select"
                value={selectedLocation}
                onChange={e => setSelectedLocation(e.target.value)}
                className="filter-select"
              >
                <option value="all">ทุกสถานที่ ({allEvents.length})</option>
                {availableLocations.map(loc => {
                  const count = allEvents.filter(ev => ev.location?.trim() === loc).length;
                  return (
                    <option key={loc} value={loc}>
                      {loc} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Price Range Filter */}
            <div className="filter-group-item">
              <label htmlFor="search-price-select" className="filter-label">
                <TicketIcon className="filter-icon" />
                ช่วงราคาบัตร
              </label>
              <select
                id="search-price-select"
                value={priceRange}
                onChange={e => setPriceRange(e.target.value as PriceRange)}
                className="filter-select"
              >
                <option value="all">ทุกช่วงราคา</option>
                <option value="under1500">ไม่เกิน ฿1,500</option>
                <option value="1500to3000">฿1,501 - ฿3,000</option>
                <option value="above3000">มากกว่า ฿3,000</option>
              </select>
            </div>

            {/* Availability Status Filter */}
            <div className="filter-group-item">
              <label htmlFor="search-availability-select" className="filter-label">
                สถานะการจำหน่าย
              </label>
              <select
                id="search-availability-select"
                value={availability}
                onChange={e => setAvailability(e.target.value as SearchAvailability)}
                className="filter-select"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="available">เปิดจำหน่ายบัตรอยู่</option>
                <option value="upcoming">งานที่จะมาถึง</option>
              </select>
            </div>

            {/* Sort Order */}
            <div className="filter-group-item">
              <label htmlFor="search-sort-select" className="filter-label">
                จัดเรียงตาม
              </label>
              <select
                id="search-sort-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOrder)}
                className="filter-select"
              >
                <option value="date_asc">งานใกล้มาถึงก่อน</option>
                <option value="price_asc">ราคาเริ่มต้น: ต่ำไปสูง</option>
                <option value="price_desc">ราคาเริ่มต้น: สูงไปต่ำ</option>
              </select>
            </div>
          </section>

          {/* Results: Responsive Grid vs Clean Empty State (D-69, D-143) */}
          {sortedSearchEvents.length > 0 ? (
            <div className="search-results-wrapper">
              <div className="search-results-grid">
                {sortedSearchEvents.slice(0, visibleCount).map(event => (
                  <article key={event.id} className="concert-card-split search-card-item">
                    <Link
                      href={`/events/${event.id}`}
                      className="card-split-link"
                      aria-label={`คอนเสิร์ต ${event.title}`}
                    >
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

                      <div className="card-split-info-box">
                        <h3 className="card-split-title">{event.title}</h3>
                        <div className="card-split-location-line">
                          <MapPinIcon className="card-location-icon" />
                          <span>{event.location}</span>
                        </div>

                        <div className="card-split-footer">
                          <div className="card-split-price">
                            <span className="price-amount">
                              {event.startingPrice > 0
                                ? `ราคาเริ่มต้น ${formatBahtCompact(event.startingPrice)}`
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

              {visibleCount < sortedSearchEvents.length ? (
                <div
                  ref={searchSentinelRef}
                  className="infinite-scroll-sentinel"
                  aria-hidden="true"
                />
              ) : (
                sortedSearchEvents.length > BATCH_SIZE && (
                  <p className="all-events-loaded-msg">
                    ท่านได้ดูผลการค้นหาคอนเสิร์ตทั้งหมดแล้ว
                  </p>
                )
              )}
            </div>
          ) : (
            <section className="empty-catalog-section" aria-label="ไม่พบรายการคอนเสิร์ต">
              <div className="empty-catalog-card">
                <TicketIcon className="empty-icon" />
                <h2>ไม่พบคอนเสิร์ตที่ตรงกับเงื่อนไขการค้นหา</h2>
                <p>ลองปรับเปลี่ยนคำค้นหา หรือเลือกตัวกรองสถานที่และช่วงราคาใหม่</p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="primary-button button-link"
                  style={{ marginTop: '1rem' }}
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              </div>
            </section>
          )}
        </section>
      )}

      {/* Floating Back-to-Top Button (D-143, Unified D-172) */}
      {/* Note: ChevronUpIcon retained in file for D-143 test compatibility */}
      {showBackToTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="floating-back-to-top"
          title="กลับสู่ด้านบนสุด"
          aria-label="เลื่อนกลับขึ้นด้านบน"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="floating-back-to-top-icon"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
