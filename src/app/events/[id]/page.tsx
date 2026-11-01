import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TicketIcon } from '@/components/ticket-icon';
import { AlertIcon } from '@/components/alert-icon';
import {
  CalendarIcon,
  MapPinIcon,
  ClockIcon,
  ArrowLeftIcon,
  InfoIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@/components/icons';
import { getDatabasePool } from '@/server/database';
import { getPublicEventWithApprovedSessions } from '@/server/events';
import { formatDate, formatTime, formatBaht } from '@/lib/locale';
import { PurchaseStepIndicator } from '@/components/purchase-step-indicator';
import { EventSessionsAccordion, type EventSession } from '@/components/event-sessions-accordion';
import { PurchaseTermsFaqList } from '@/components/purchase-terms-faq-list';
import { ExpandableEventDescription } from '@/components/expandable-event-description';
import { EventProhibitedItemsCarousel } from '@/components/event-prohibited-items-carousel';
import { EventInteractivePoster } from '@/components/event-interactive-poster';
import { EventOfficialGallery } from '@/components/event-official-gallery';
import { ArtistPointerMascot } from '@/components/artist-pointer-mascot';

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ orderId?: string; expired?: string }>;
}

export default async function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const orderId = resolvedSearchParams.orderId;
  const isExpired = resolvedSearchParams.expired === 'true';
  let event = null;

  try {
    const pool = getDatabasePool();
    event = await getPublicEventWithApprovedSessions(pool, id);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.error('Error fetching event details:', error);
    }
  }

  if (!event) {
    notFound();
  }

  const sessions: EventSession[] = event.sessions || [];

  let startingPrice = 0;
  for (const s of sessions) {
    for (const t of s.ticketTypes || []) {
      if (t.price > 0 && (startingPrice === 0 || t.price < startingPrice)) {
        startingPrice = t.price;
      }
    }
  }

  return (
    <div className="event-detail-page">
      {/* Top back navigation */}
      <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
        <Link href="/" className="back-link">
          <ArrowLeftIcon /> ย้อนกลับไปหน้าแรก
        </Link>
      </nav>

      {/* Stepper showing: 1. รายละเอียดคอนเสิร์ต -> 2. เลือกรอบและประเภทบัตร -> 3. ชำระเงิน (Read-only D-34) */}
      <PurchaseStepIndicator currentStep="details" eventId={event.id} />

      {isExpired && (
        <div
          role="alert"
          className="event-expired-alert-banner"
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '14px',
            color: '#991b1b',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.08)',
          }}
        >
          <AlertIcon />
          <span style={{ fontWeight: 500 }}>
            หมดเวลาทำรายการ 15 นาที ระบบได้คืนโควตาบัตรแล้ว กรุณาเริ่มทำรายการใหม่อีกครั้ง
          </span>
        </div>
      )}

      {orderId && (
        <div
          style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '14px',
            color: '#1e40af',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <InfoIcon />
            <span>ท่านมีคำสั่งซื้อ <strong>{orderId}</strong> สำหรับคอนเสิร์ตนี้</span>
          </div>
          <Link
            href={`/my-tickets?orderId=${encodeURIComponent(orderId)}`}
            className="primary-button button-link"
            style={{
              padding: '6px 14px',
              minHeight: '36px',
              fontSize: '13px',
              whiteSpace: 'nowrap',
            }}
          >
            ยืนยันตัวตนเพื่อเปิดดูบัตร
          </Link>
        </div>
      )}

      {/* 1. Wide Panoramic Cover Banner (D-34) */}
      <div className="event-cover-banner-wrapper">
        {event.posterUrl ? (
          /* biome-ignore lint/performance/noImgElement: panoramic cover banner display */
          <img
            src={event.posterUrl}
            alt={`แบนเนอร์คอนเสิร์ต ${event.title}`}
            className="event-cover-banner-img"
          />
        ) : (
          <div className="event-cover-banner-placeholder">
            <TicketIcon />
            <span>LIVE CONCERT EXPERIENCE</span>
          </div>
        )}
      </div>

      {/* 2. Hero Event Overview Card (D-34, D-35) */}
      <header className="event-hero-card">
        <div className="hero-card-header-row">
          <h1 className="event-title" style={{ margin: 0 }}>{event.title}</h1>
          <div className="hero-price-wrap">
            <span className="hero-price-label">ราคาบัตร</span>
            <span className="hero-price-amount">
              {startingPrice > 0 ? `เริ่มต้น ${formatBaht(startingPrice)}` : 'ฟรี'}
            </span>
          </div>
        </div>

        {/* Horizontal Meta Cards Track (D-148) */}
        <div className="hero-meta-cards-track">
          <div className="hero-meta-card">
            <div className="meta-icon-box"><MapPinIcon /></div>
            <div className="hero-meta-card-content">
              <strong className="meta-item-label">สถานที่จัดงาน</strong>
              <p className="meta-item-value">{event.location}</p>
            </div>
          </div>

          {sessions.length > 0 && (
            <div className="hero-meta-card">
              <div className="meta-icon-box"><CalendarIcon /></div>
              <div className="hero-meta-card-content">
                <strong className="meta-item-label">กำหนดการแสดง</strong>
                <p className="meta-item-value">
                  <span className="text-nowrap">{formatDate(new Date(sessions[0].startTime))}</span>
                  {sessions.length > 1 && (
                    <>
                      {' '}ถึง{' '}
                      <span className="text-nowrap">{formatDate(new Date(sessions[sessions.length - 1].startTime))}</span>
                    </>
                  )}
                  {' '}<span className="text-nowrap">(ทั้งหมด {sessions.length} รอบการแสดง)</span>
                </p>
              </div>
            </div>
          )}

          <div className="hero-meta-card">
            <div className="meta-icon-box"><ClockIcon /></div>
            <div className="hero-meta-card-content">
              <strong className="meta-item-label">เวลาแสดงและประตูเปิด</strong>
              <p className="meta-item-value">
                {sessions.length > 0 ? (
                  <>
                    <span className="text-nowrap">
                      {formatTime(new Date(sessions[0].startTime))} – {formatTime(new Date(sessions[0].endTime))} น.
                    </span>
                    {sessions[0]?.admissionStartTime && (
                      <>
                        {' '}
                        <span className="text-nowrap">
                          (ประตูเปิด {formatTime(new Date(sessions[0].admissionStartTime))} น.)
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  'แจ้งให้ทราบล่วงหน้าก่อนวันงาน'
                )}
              </p>
            </div>
          </div>

          <div className="hero-meta-card">
            <div className="meta-icon-box"><ShieldCheckIcon /></div>
            <div className="hero-meta-card-content">
              <strong className="meta-item-label">สิทธิ์และเงื่อนไขการจอง</strong>
              <p className="meta-item-value">
                <span className="text-nowrap">จำกัดสูงสุดไม่เกิน {event.limitPerOrder} ใบ / คำสั่งซื้อ</span>
                {' · '}
                <span className="text-nowrap">ไม่ต้องสมัครสมาชิก</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* 3. Categorized Detail Cards (D-34, D-35, D-145, D-147) */}
      <div className="event-categories-list">
        {/* Category 1: รายละเอียดคอนเสิร์ตและไลน์อัปศิลปิน (D-145, D-147) */}
        <section className="event-category-card" aria-labelledby="cat-lineup-title">
          <div className="category-header-wrap">
            <h2 id="cat-lineup-title" className="category-heading">
              <SparklesIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
              รายละเอียดคอนเสิร์ตและไลน์อัปศิลปิน (Lineup & Details)
            </h2>
          </div>

          <div className="category-body-content">
            <div className="detail-with-poster-layout">
              {/* Sharp 4:5 Vertical Poster with Lightbox (D-147) */}
              <div className="detail-poster-card-col">
                <EventInteractivePoster
                  posterUrl={event.posterUrl}
                  title={event.title}
                />
              </div>

              {/* Details, 2x2 Lineup Grid & Description (D-145) */}
              <div className="detail-info-col">
                <div className="artist-lineup-section">
                  <h3 className="category-sub-heading" style={{ marginTop: 0 }}>
                    ศิลปินผู้ร่วมสร้างสรรค์การแสดง (Lineup)
                  </h3>
                  <div className="artist-grid-2x2">
                    <div className="artist-card-item primary-artist">
                      <span className="artist-role-badge">ศิลปินหลัก</span>
                      <strong className="artist-name">THE NEON BAND</strong>
                    </div>
                    <div className="artist-card-item">
                      <span className="artist-role-badge guest-badge">ศิลปินรับเชิญ</span>
                      <strong className="artist-name">ELECTRIC DREAMS</strong>
                    </div>
                    <div className="artist-card-item">
                      <span className="artist-role-badge guest-badge">Special Guest DJ</span>
                      <strong className="artist-name">DJ NEBULA</strong>
                    </div>
                    <div className="artist-card-item">
                      <span className="artist-role-badge guest-badge">วงออร์เคสตรา</span>
                      <strong className="artist-name">SYMPHONY ENSEMBLE</strong>
                    </div>
                  </div>
                </div>

                <div className="event-description-section" style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--line)' }}>
                  <h3 className="category-sub-heading" style={{ marginTop: 0 }}>
                    เกี่ยวกับคอนเสิร์ตนี้
                  </h3>
                  {event.description ? (
                    <ExpandableEventDescription
                      title={event.title}
                      description={event.description}
                    />
                  ) : (
                    <p className="description-text" style={{ color: 'var(--muted)', margin: 0 }}>
                      ผู้จัดงานยังไม่ได้ระบุรายละเอียดเพิ่มเติมสำหรับคอนเสิร์ตนี้
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Category 2: ภาพและรายละเอียดเพิ่มเติมจากผู้จัด (Event Gallery & Official Details) (D-147) */}
        <EventOfficialGallery eventTitle={event.title} />

        {/* Category 3: รอบการแสดงและประเภทบัตร */}
        <section className="event-category-card" aria-labelledby="cat-sessions-title">
          <div className="category-header-wrap">
            <h2 id="cat-sessions-title" className="category-heading">
              <CalendarIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
              รอบการแสดงและประเภทบัตร (Sessions & Ticket Categories)
            </h2>
          </div>

          <div className="category-body-content">
            <p className="section-note" style={{ margin: '0 0 1.2rem', color: 'var(--muted)' }}>
              คลิกที่แต่ละรอบการแสดงเพื่อตรวจสอบโซน ราคา และโควตาคงเหลือ (สามารถย่อ-ขยายข้อมูลได้)
            </p>
            <EventSessionsAccordion sessions={sessions} />
          </div>
        </section>

        {/* Category 3: สถานที่จัดงานและแผนที่การเดินทาง */}
        <section className="event-category-card" aria-labelledby="cat-venue-title">
          <div className="category-header-wrap">
            <div className="venue-heading-split">
              <h2 id="cat-venue-title" className="category-heading">
                <MapPinIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
                สถานที่จัดงานและแผนที่การเดินทาง (Venue & Map)
              </h2>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="secondary-button button-link venue-map-external-btn"
              >
                เปิดใน Google Maps &rarr;
              </a>
            </div>
          </div>

          <div className="category-body-content">
            <p className="venue-address-text" style={{ marginBottom: '1rem' }}>
              <strong>สถานที่:</strong> {event.location}
            </p>
            <div className="google-map-embed-wrapper">
              <iframe
                src={`https://maps.google.com/maps?q=${encodeURIComponent(event.location)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                width="100%"
                height="340"
                style={{ border: 0, borderRadius: '12px' }}
                loading="lazy"
                title={`แผนที่ Google Maps ${event.location}`}
              />
            </div>
          </div>
        </section>

        {/* Category 4: กฎระเบียบและสิ่งของต้องห้ามนำเข้างาน (Regulations & Prohibited Items Carousel) (D-146) */}
        <EventProhibitedItemsCarousel />

        {/* Category 5: ข้อกำหนดและข้อชี้แจงในการซื้อบัตร (D-42: Independent FAQ item cards) */}
        <PurchaseTermsFaqList />
      </div>

      {/* 4. Single Sticky Bottom Action Bar (D-34, D-35) */}
      <aside className="event-sticky-bottom-bar" aria-label="แถบดำเนินการซื้อบัตร">
        <div className="event-sticky-bottom-inner">
          <div className="sticky-bar-info">
            <span className="sticky-bar-title">{event.title}</span>
            <span className="sticky-bar-meta">
              {startingPrice > 0 ? `เริ่มต้น ${formatBaht(startingPrice)}` : 'ฟรี'} · จำกัด {event.limitPerOrder} ใบ/คำสั่งซื้อ
            </span>
          </div>
          <div className="sticky-bar-cta-wrap">
            <Link
              href={`/events/${event.id}/queue`}
              className="primary-button sticky-bar-buy-btn"
              id="sidebar-buy-tickets-btn"
              data-testid="enter-queue-cta-btn"
            >
              ซื้อบัตร
            </Link>
          </div>
        </div>

        {/* Viewport-Right Anchored Lisa Mascot (D-158) */}
        <ArtistPointerMascot
          singleUrl={(event as { artistPointerUrl?: string }).artistPointerUrl}
          customUrls={(event as { artistPointerUrls?: string[] }).artistPointerUrls}
        />
      </aside>
    </div>
  );
}
