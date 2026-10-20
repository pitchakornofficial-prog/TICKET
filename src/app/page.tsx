import Link from 'next/link';
import { TicketIcon } from '@/components/ticket-icon';
import { SearchForm } from '@/components/search-form';
import { CalendarIcon, MapPinIcon, CheckCircleIcon } from '@/components/icons';
import { getDatabasePool } from '@/server/database';
import { listPublicEvents, type PublicEventSummary } from '@/server/events';
import { formatBaht, formatDate } from '@/lib/locale';

export const metadata = {
  title: 'TICKET — บัตรคอนเสิร์ต',
  description: 'แพลตฟอร์มจำหน่ายบัตรคอนเสิร์ตในประเทศไทย ซื้อบัตรได้โดยไม่สมัครสมาชิก',
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  let events: PublicEventSummary[] = [];

  try {
    const pool = getDatabasePool();
    events = await listPublicEvents(pool, q);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.warn('Unable to query public events:', error);
    }
  }

  const hasEvents = events.length > 0;
  const isSearching = Boolean(q?.trim());
  const featuredEvent = hasEvents && !isSearching ? events[0] : null;
  const catalogEvents = hasEvents && !isSearching ? events.slice(1) : events;

  return (
    <div className="home-container">
      {/* Hero / Opening Section */}
      <section className="opening home-hero" aria-labelledby="opening-title">
        <div className="opening-copy">
          <p className="eyebrow">คอนเสิร์ต · ดนตรี · ความทรงจำ</p>
          <h1 id="opening-title">เวทีต่อไป<br />ความทรงจำครั้งใหม่</h1>
          <p className="intro">
            พื้นที่สำหรับคนรักดนตรีสด ซื้อบัตรได้สะดวกรวดเร็ว<br />
            ไม่จำเป็นต้องสมัครสมาชิก รับบัตรทันทีทางอีเมล
          </p>

          {/* Search Box */}
          <div className="hero-search-wrapper">
            <SearchForm initialQuery={q} />
          </div>

          {/* Empty / Not yet selling notice for clean state */}
          {!hasEvents && !isSearching && (
            <div className="opening-notice">
              <TicketIcon />
              <div>
                <h2>กำลังเตรียมเปิดให้บริการ</h2>
                <p>ยังไม่เปิดจำหน่ายบัตรในขณะนี้</p>
              </div>
            </div>
          )}
        </div>

        <div className="opening-mark" aria-hidden="true">
          <span className="vertical-word">LIVE MUSIC</span>
          <TicketIcon className="large-ticket" />
          <span className="mark-caption">TICKET</span>
        </div>
      </section>

      {/* Search Header Info */}
      {isSearching && (
        <section className="search-results-bar">
          <div className="search-results-info">
            <h2>ผลการค้นหาสำหรับ &ldquo;{q}&rdquo;</h2>
            <p>พบทั้งหมด {events.length} รายการ</p>
          </div>
          <Link href="/" className="secondary-button button-link clear-search-button">
            ล้างคำค้นหา
          </Link>
        </section>
      )}

      {/* Empty Search Result State */}
      {!hasEvents && isSearching && (
        <section className="empty-catalog-section" aria-label="ไม่พบรายการคอนเสิร์ต">
          <div className="empty-catalog-card">
            <TicketIcon className="empty-icon" />
            <h2>ไม่พบคอนเสิร์ตที่ตรงกับคำค้นหา</h2>
            <p>กรุณาลองค้นหาด้วยชื่ออื่น หรือค้นหาตามสถานที่จัดงาน</p>
            <Link href="/" className="primary-button button-link">
              ดูคอนเสิร์ตทั้งหมด
            </Link>
          </div>
        </section>
      )}

      {/* Featured Concert (D-03) */}
      {featuredEvent && (
        <section className="featured-section" aria-labelledby="featured-heading">
          <div className="section-title-wrap">
            <h2 id="featured-heading" className="section-title">คอนเสิร์ตแนะนำ</h2>
            <span className="section-subtitle">ห้ามพลาดกับเวทีการแสดงเด่นประจำสัปดาห์</span>
          </div>

          <div className="featured-card">
            <div className="featured-poster-wrap">
              {featuredEvent.posterUrl ? (
                /* biome-ignore lint/performance/noImgElement: public catalog display */
                <img
                  src={featuredEvent.posterUrl}
                  alt={`โปสเตอร์คอนเสิร์ต ${featuredEvent.title}`}
                  className="featured-poster-img"
                />
              ) : (
                <div className="poster-placeholder">
                  <TicketIcon />
                  <span>TICKET LIVE</span>
                </div>
              )}
              <div className="status-badge available-badge">
                <CheckCircleIcon /> เปิดจำหน่าย
              </div>
            </div>

            <div className="featured-info">
              <div className="featured-meta">
                <span className="meta-item">
                  <CalendarIcon />
                  {formatDate(new Date(featuredEvent.earliestStartTime))}
                </span>
                <span className="meta-item">
                  <MapPinIcon />
                  {featuredEvent.location}
                </span>
              </div>

              <h3 className="featured-title">{featuredEvent.title}</h3>
              {featuredEvent.description && (
                <p className="featured-desc">{featuredEvent.description}</p>
              )}

              <div className="featured-pricing-bar">
                <div className="price-tag">
                  <span className="price-label">ราคาบัตร</span>
                  <span className="price-value">
                    {featuredEvent.startingPrice > 0 ? `เริ่มต้น ${formatBaht(featuredEvent.startingPrice)}` : 'เปิดให้เข้าชม'}
                  </span>
                </div>
                <Link
                  href={`/events/${featuredEvent.id}`}
                  className="primary-button button-link featured-action-btn"
                >
                  ดูรายละเอียดและรอบการแสดง
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Concert Catalog Grid (D-02, D-07) */}
      {catalogEvents.length > 0 && (
        <section className="catalog-section" aria-labelledby="catalog-heading">
          <div className="section-title-wrap">
            <h2 id="catalog-heading" className="section-title">
              {isSearching ? 'รายการคอนเสิร์ต' : 'คอนเสิร์ตทั้งหมด'}
            </h2>
            <span className="section-subtitle">เลือกชมรอบการแสดงและสั่งซื้อบัตรเข้าชม</span>
          </div>

          <div className="concert-grid">
            {catalogEvents.map(event => (
              <article key={event.id} className="concert-card">
                <Link href={`/events/${event.id}`} className="concert-card-link">
                  <div className="concert-poster-wrap">
                    {event.posterUrl ? (
                      /* biome-ignore lint/performance/noImgElement: public catalog display */
                      <img
                        src={event.posterUrl}
                        alt={`โปสเตอร์คอนเสิร์ต ${event.title}`}
                        className="concert-poster-img"
                        loading="lazy"
                      />
                    ) : (
                      <div className="poster-placeholder mini">
                        <TicketIcon />
                      </div>
                    )}
                    <span className="status-badge available-badge">
                      <CheckCircleIcon /> เปิดจำหน่าย
                    </span>
                  </div>

                  <div className="concert-content">
                    <div className="concert-meta">
                      <span className="meta-item">
                        <CalendarIcon />
                        {formatDate(new Date(event.earliestStartTime))}
                      </span>
                      <span className="meta-item">
                        <MapPinIcon />
                        {event.location}
                      </span>
                    </div>

                    <h3 className="concert-title">{event.title}</h3>

                    <div className="concert-footer-bar">
                      <div className="concert-price">
                        <span className="price-label">ราคาบัตร</span>
                        <span className="price-amount">
                          {event.startingPrice > 0 ? `เริ่มต้น ${formatBaht(event.startingPrice)}` : 'ฟรี'}
                        </span>
                      </div>
                      <span className="view-detail-label">ดูรายละเอียด &rarr;</span>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
