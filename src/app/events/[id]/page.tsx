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
  UsersIcon,
} from '@/components/icons';
import { getDatabasePool } from '@/server/database';
import { getPublicEventWithApprovedSessions } from '@/server/events';
import { formatDate, formatTime, formatBaht } from '@/lib/locale';
import { PurchaseStepIndicator } from '@/components/purchase-step-indicator';
import { EventSessionsAccordion, type EventSession } from '@/components/event-sessions-accordion';
import { PurchaseTermsFaqList } from '@/components/purchase-terms-faq-list';

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

        <div className="event-hero-meta-grid">
          <div className="hero-meta-item">
            <div className="meta-icon-box"><MapPinIcon /></div>
            <div>
              <strong className="meta-item-label">สถานที่จัดงาน</strong>
              <p className="meta-item-value">{event.location}</p>
            </div>
          </div>

          {sessions.length > 0 && (
            <div className="hero-meta-item">
              <div className="meta-icon-box"><CalendarIcon /></div>
              <div>
                <strong className="meta-item-label">กำหนดการแสดง</strong>
                <p className="meta-item-value">
                  {formatDate(new Date(sessions[0].startTime))}
                  {sessions.length > 1 && ` ถึง ${formatDate(new Date(sessions[sessions.length - 1].startTime))}`}
                  {' '}(ทั้งหมด {sessions.length} รอบการแสดง)
                </p>
              </div>
            </div>
          )}

          <div className="hero-meta-item">
            <div className="meta-icon-box"><ClockIcon /></div>
            <div>
              <strong className="meta-item-label">เวลาแสดงและประตูเปิด</strong>
              <p className="meta-item-value">
                {sessions.length > 0
                  ? `${formatTime(new Date(sessions[0].startTime))} – ${formatTime(new Date(sessions[0].endTime))} น.`
                  : 'แจ้งให้ทราบล่วงหน้าก่อนวันงาน'}
                {sessions[0]?.admissionStartTime && (
                  <span> (ประตูเปิด {formatTime(new Date(sessions[0].admissionStartTime))} น.)</span>
                )}
              </p>
            </div>
          </div>

          <div className="hero-meta-item">
            <div className="meta-icon-box"><ShieldCheckIcon /></div>
            <div>
              <strong className="meta-item-label">สิทธิ์และเงื่อนไขการจอง</strong>
              <p className="meta-item-value">จำกัดสูงสุดไม่เกิน {event.limitPerOrder} ใบ / คำสั่งซื้อ · ไม่ต้องสมัครสมาชิก</p>
            </div>
          </div>
        </div>
      </header>

      {/* 3. Four Categorized Detail Cards (D-34, D-35) */}
      <div className="event-categories-list">
        {/* Category 1: รายละเอียดงานและไลน์อัปศิลปิน */}
        <section className="event-category-card" aria-labelledby="cat-lineup-title">
          <div className="category-header-wrap">
            <h2 id="cat-lineup-title" className="category-heading">
              <UsersIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
              รายละเอียดงานและไลน์อัปศิลปิน (Lineup & Performers)
            </h2>
          </div>

          <div className="category-body-content">
            <div className="detail-with-poster-layout">
              {/* Vertical 4:5 Poster Card (D-35) */}
              <div className="detail-poster-card-col">
                <div className="category-vertical-poster-card">
                  {event.posterUrl ? (
                    /* biome-ignore lint/performance/noImgElement: vertical concert poster */
                    <img
                      src={event.posterUrl}
                      alt={`โปสเตอร์ ${event.title}`}
                      className="category-vertical-poster-img"
                    />
                  ) : (
                    <div className="category-vertical-poster-placeholder">
                      <TicketIcon />
                      <span>LIVE POSTER</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Details & Lineup */}
              <div className="detail-info-col">
                <h3 className="category-sub-heading" style={{ marginTop: 0 }}>ศิลปินผู้ร่วมสร้างสรรค์การแสดง</h3>
                <div className="artist-tags-wrap">
                  <span className="artist-tag main-artist">THE NEON BAND (ศิลปินหลัก)</span>
                  <span className="artist-tag">ELECTRIC DREAMS</span>
                  <span className="artist-tag">SPECIAL GUEST DJ</span>
                  <span className="artist-tag">SYMPHONY ORCHESTRA ENSEMBLE</span>
                </div>
                <p className="artist-desc-copy">
                  เตรียมพบกับการรวมตัวของไลน์อัปศิลปินแถวหน้า เต็มอิ่มกับระบบเสียงสเตอริโอรอบทิศทางและการออกแบบแสงสีเสียงระดับเวิลด์คลาส
                </p>

                {event.description && (
                  <div className="category-sub-block">
                    <h3 className="category-sub-heading">เกี่ยวกับคอนเสิร์ตนี้</h3>
                    <div className="description-text">
                      <p>{event.description}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Category 2: รอบการแสดงและประเภทบัตร */}
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

        {/* Category 4: ข้อกำหนดและข้อชี้แจงในการซื้อบัตร (D-42: Independent FAQ item cards) */}
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
          <Link
            href={`/events/${event.id}/queue`}
            className="primary-button sticky-bar-buy-btn"
            id="sidebar-buy-tickets-btn"
            data-testid="enter-queue-cta-btn"
          >
            ซื้อบัตร
          </Link>
        </div>
      </aside>
    </div>
  );
}
