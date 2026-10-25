import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TicketIcon } from '@/components/ticket-icon';
import {
  CalendarIcon,
  MapPinIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
  InfoIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@/components/icons';
import { getDatabasePool } from '@/server/database';
import { getPublicEventWithApprovedSessions } from '@/server/events';
import { formatDate, formatTime } from '@/lib/locale';
import { PurchaseStepIndicator } from '@/components/purchase-step-indicator';
import { EventSessionsAccordion, type EventSession } from '@/components/event-sessions-accordion';

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ orderId?: string }>;
}

export default async function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const orderId = resolvedSearchParams.orderId;
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
  const organizerName = event.organizerName || 'ผู้จัดงานดนตรีสด (Live Concert Official)';

  return (
    <div className="event-detail-page">
      {/* Top back navigation */}
      <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
        <Link href="/" className="back-link">
          <ArrowLeftIcon /> ย้อนกลับไปหน้าแรก
        </Link>
      </nav>

      {/* Stepper showing: 1. รายละเอียดคอนเสิร์ต -> 2. เลือกรอบและประเภทบัตร -> 3. ชำระเงิน */}
      <PurchaseStepIndicator currentStep="details" eventId={event.id} />

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

      {/* Main detail layout */}
      <div className="detail-layout">
        {/* Left column: Event header, details, map, and collapsible sessions */}
        <div className="detail-main-column">
          {/* Hero Section */}
          <header className="event-header-section">
            <div className="detail-poster-wrap">
              {event.posterUrl ? (
                /* biome-ignore lint/performance/noImgElement: public event detail display */
                <img
                  src={event.posterUrl}
                  alt={`โปสเตอร์คอนเสิร์ต ${event.title}`}
                  className="detail-poster-img"
                />
              ) : (
                <div className="poster-placeholder large">
                  <TicketIcon />
                  <span>TICKET LIVE MUSIC</span>
                </div>
              )}
            </div>

            <div className="event-header-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <span className="status-badge available-badge">
                  <CheckCircleIcon /> เปิดจำหน่ายบัตร
                </span>
                <span className="event-organizer-pill">
                  <ShieldCheckIcon style={{ width: '15px', height: '15px' }} />
                  {organizerName}
                </span>
              </div>

              <h1 className="event-title">{event.title}</h1>

              <div className="event-meta-list">
                <div className="meta-row">
                  <MapPinIcon />
                  <div>
                    <strong>สถานที่จัดงาน</strong>
                    <p>{event.location}</p>
                  </div>
                </div>

                {sessions.length > 0 && (
                  <div className="meta-row">
                    <CalendarIcon />
                    <div>
                      <strong>กำหนดการแสดง</strong>
                      <p>
                        {formatDate(new Date(sessions[0].startTime))}
                        {sessions.length > 1 && ` ถึง ${formatDate(new Date(sessions[sessions.length - 1].startTime))}`}
                        {' '}(ทั้งหมด {sessions.length} รอบการแสดง)
                      </p>
                    </div>
                  </div>
                )}

                <div className="meta-row">
                  <ClockIcon />
                  <div>
                    <strong>เวลาแสดงและประตูเปิด</strong>
                    <p>
                      {sessions.length > 0
                        ? `${formatTime(new Date(sessions[0].startTime))} – ${formatTime(new Date(sessions[0].endTime))} น.`
                        : 'แจ้งให้ทราบล่วงหน้าก่อนวันงาน'}
                      {sessions[0]?.admissionStartTime && (
                        <span> (ประตูเปิด {formatTime(new Date(sessions[0].admissionStartTime))} น.)</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="meta-row">
                  <ShieldCheckIcon />
                  <div>
                    <strong>สิทธิ์และเงื่อนไขการจอง</strong>
                    <p>จำกัดสูงสุดไม่เกิน {event.limitPerOrder} ใบ / คำสั่งซื้อ · ไม่ต้องสมัครสมาชิก</p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Artist and Lineup Section */}
          <section className="event-artist-card" aria-labelledby="artist-section-title">
            <h2 id="artist-section-title" className="detail-section-title">
              <UsersIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
              ศิลปินและผู้ร่วมสร้างสรรค์การแสดง (Lineup & Performers)
            </h2>
            <div className="artist-tags-wrap">
              <span className="artist-tag main-artist">THE NEON BAND (ศิลปินหลัก)</span>
              <span className="artist-tag">ELECTRIC DREAMS</span>
              <span className="artist-tag">SPECIAL GUEST DJ</span>
              <span className="artist-tag">SYMPHONY ORCHESTRA ENSEMBLE</span>
            </div>
            <p className="artist-desc-copy">
              เตรียมพบกับการรวมตัวของไลน์อัปศิลปินแถวหน้า เต็มอิ่มกับระบบเสียงสเตอริโอรอบทิศทางและการออกแบบแสงสีเสียงระดับเวิลด์คลาส
            </p>
          </section>

          {/* Event description */}
          {event.description && (
            <section className="event-description-card" aria-labelledby="desc-section-title">
              <h2 id="desc-section-title" className="detail-section-title">
                รายละเอียดงานคอนเสิร์ต
              </h2>
              <div className="description-text">
                <p>{event.description}</p>
              </div>
            </section>
          )}

          {/* Collapsible Sessions and Ticket Types (ย่อขยายได้) */}
          <section className="sessions-section" aria-labelledby="sessions-title">
            <div className="sessions-section-header">
              <div>
                <h2 id="sessions-title" className="detail-section-title">
                  รอบการแสดงและประเภทบัตร
                </h2>
                <p className="section-note" style={{ margin: '0.2rem 0 1rem' }}>
                  คลิกที่แต่ละรอบการแสดงเพื่อดูโซนที่นั่ง ราคา และประเภทบัตร (สามารถย่อ-ขยายได้)
                </p>
              </div>
            </div>

            <EventSessionsAccordion sessions={sessions} />
          </section>

          {/* Venue & Google Maps Section */}
          <section className="venue-map-card" aria-labelledby="venue-map-title">
            <div className="venue-header-box">
              <div>
                <h2 id="venue-map-title" className="detail-section-title">
                  <MapPinIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
                  สถานที่จัดงานและแผนที่การเดินทาง (Venue & Map)
                </h2>
                <p className="venue-address-text">
                  <strong>สถานที่:</strong> {event.location}
                </p>
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="secondary-button button-link"
                style={{ fontSize: '0.9rem', padding: '0.5rem 1rem', minHeight: '40px' }}
              >
                เปิดใน Google Maps &rarr;
              </a>
            </div>

            <div className="google-map-embed-wrapper">
              <iframe
                src={`https://maps.google.com/maps?q=${encodeURIComponent(event.location)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                width="100%"
                height="320"
                style={{ border: 0, borderRadius: '12px' }}
                loading="lazy"
                title={`แผนที่ Google Maps ${event.location}`}
              />
            </div>
          </section>

          {/* Event Rules & Regulations */}
          <section className="event-rules-card" aria-labelledby="rules-section-title">
            <h2 id="rules-section-title" className="detail-section-title">
              ข้อปฏิบัติและข้อตกลงการเข้าชมงาน (Rules & Guidelines)
            </h2>
            <div className="rules-grid">
              <div className="rule-item-box">
                <strong>การเข้าชมงาน</strong>
                <p>ประตูเปิดก่อนเวลาแสดงประมาณ 2 ชั่วโมง กรุณาเผื่อเวลาสำหรับการตรวจบัตรดิจิทัลและกระเป๋าสัมภาระ</p>
              </div>
              <div className="rule-item-box">
                <strong>การตรวจบัตรเข้างาน</strong>
                <p>เปิด QR Code บัตรดิจิทัลแต่ละใบจากอีเมลหรือหน้าเว็บ TICKET เพื่อให้เจ้าหน้าที่สแกน ณ ประตูทางเข้า</p>
              </div>
              <div className="rule-item-box">
                <strong>สิ่งของต้องห้าม</strong>
                <p>ไม่อนุญาตให้นำกล้องโปรเลนส์ซูม, ไม้เซลฟี่, ป้ายไฟขนาดใหญ่กว่า A4, อาวุธ และเครื่องดื่มแอลกอฮอล์จากภายนอกเข้างาน</p>
              </div>
              <div className="rule-item-box">
                <strong>การออกจากงานชั่วคราว</strong>
                <p>กรณีจำเป็นต้องออกจากพื้นที่จัดงาน ต้องให้ทีมสแกนบันทึกการออกที่จุด Re-Entry จึงจะสามารถกลับเข้ามาได้</p>
              </div>
            </div>
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <Link href="/terms" className="text-link" style={{ fontSize: '0.9rem' }}>
                อ่านข้อกำหนดและเงื่อนไขการซื้อบัตรฉบับเต็ม &rarr;
              </Link>
            </div>
          </section>
        </div>

        {/* Right column: Single Sticky Purchase Box (D-09) */}
        <aside className="detail-sidebar" aria-label="สรุปข้อมูลการสั่งซื้อ">
          <div className="sticky-purchase-card">
            <h3>ข้อมูลคอนเสิร์ต</h3>
            <p className="sidebar-event-title">{event.title}</p>
            <div className="sidebar-meta">
              <div>
                <MapPinIcon />
                <span>{event.location}</span>
              </div>
              <div>
                <ShieldCheckIcon />
                <span>จำกัดไม่เกิน {event.limitPerOrder} ใบ / คำสั่งซื้อ</span>
              </div>
            </div>

            <div className="sidebar-action-wrap">
              <p className="sidebar-action-hint">
                ระบบจำหน่ายบัตรแบบ Guest ซื้อได้ทันทีโดยไม่ต้องสมัครสมาชิก ชำระผ่าน PromptPay QR
              </p>
              {/* EXACTLY ONE PURCHASE BUTTON on desktop */}
              <div className="sidebar-action-box">
                <Link
                  href={`/events/${event.id}/queue`}
                  className="primary-button button-link sidebar-buy-button"
                  id="sidebar-buy-tickets-btn"
                  data-testid="enter-queue-cta-btn"
                >
                  ซื้อบัตรคอนเสิร์ตนี้ &rarr;
                </Link>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile sticky bottom bar: EXACTLY ONE PURCHASE BUTTON on mobile */}
      <aside className="mobile-bottom-bar" aria-label="แถบดำเนินการบนมือถือ">
        <div className="mobile-bar-info">
          <span className="mobile-bar-title">{event.title}</span>
          <span className="mobile-bar-hint">จำกัด {event.limitPerOrder} ใบ/คำสั่งซื้อ</span>
        </div>
        <Link
          href={`/events/${event.id}/queue`}
          className="primary-button mobile-bar-button"
          id="mobile-buy-tickets-btn"
          data-testid="enter-queue-cta-btn"
        >
          ซื้อบัตร
        </Link>
      </aside>
    </div>
  );
}
