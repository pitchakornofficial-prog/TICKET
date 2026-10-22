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
} from '@/components/icons';
import { getDatabasePool } from '@/server/database';
import { getPublicEventWithApprovedSessions } from '@/server/events';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { TicketReservationFlow } from '@/components/ticket-reservation-flow';

interface TicketType {
  id: string;
  name: string;
  price: number;
  quota: number;
  description?: string;
}

interface EventSession {
  id: string;
  startTime: string | Date;
  endTime: string | Date;
  admissionStartTime?: string | Date | null;
  admissionEndTime?: string | Date | null;
  ticketTypes: TicketType[];
}

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

  const sessions = event.sessions || [];

  return (
    <div className="event-detail-page">
      {/* Top back navigation */}
      <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
        <Link href="/" className="back-link">
          <ArrowLeftIcon /> ย้อนกลับไปหน้าแรก
        </Link>
      </nav>

      {orderId && (
        <div
          style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            padding: '12px 16px',
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
            style={{
              backgroundColor: '#1848ed',
              color: '#ffffff',
              padding: '6px 14px',
              borderRadius: '4px',
              textDecoration: 'none',
              fontWeight: 'bold',
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
        {/* Left column: Event header, poster & sessions */}
        <div className="detail-main-column">
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
              <span className="status-badge available-badge">
                <CheckCircleIcon /> เปิดจำหน่ายบัตร
              </span>
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
                      <strong>ช่วงเวลาการแสดง</strong>
                      <p>
                        {formatDate(new Date(sessions[0].startTime))}
                        {sessions.length > 1 && ` ถึง ${formatDate(new Date(sessions[sessions.length - 1].startTime))}`}
                      </p>
                    </div>
                  </div>
                )}

                <div className="meta-row">
                  <ShieldCheckIcon />
                  <div>
                    <strong>จำกัดการสั่งซื้อ</strong>
                    <p>สูงสุดไม่เกิน {event.limitPerOrder} ใบ ต่อหนึ่งคำสั่งซื้อ</p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Event description */}
          {event.description && (
            <section className="event-description-card">
              <h2>รายละเอียดการแสดง</h2>
              <div className="description-text">
                <p>{event.description}</p>
              </div>
            </section>
          )}

          {/* Sessions and Ticket Types */}
          <section className="sessions-section" aria-labelledby="sessions-title">
            <h2 id="sessions-title">รอบการแสดงและประเภทบัตร</h2>
            <p className="section-note">
              เลือกดูรอบการแสดงและราคาบัตรที่เปิดให้จำหน่าย (แสดงเฉพาะรอบที่ผ่านการอนุมัติ)
            </p>

            {sessions.length === 0 ? (
              <div className="empty-sessions-notice">
                <InfoIcon />
                <p>ยังไม่มีรอบการแสดงที่เปิดให้จำหน่ายในขณะนี้</p>
              </div>
            ) : (
              <div className="sessions-list">
                {sessions.map((session: EventSession, index: number) => {
                  const startTime = new Date(session.startTime);
                  const endTime = new Date(session.endTime);
                  const ticketTypes = session.ticketTypes || [];

                  return (
                    <article key={session.id} className="session-card">
                      <header className="session-header">
                        <div className="session-round-tag">รอบที่ {index + 1}</div>
                        <h3 className="session-date-heading">{formatDate(startTime)}</h3>
                        <div className="session-time-pills">
                          <span className="time-pill">
                            <ClockIcon /> เวลาแสดง: {formatTime(startTime)} – {formatTime(endTime)} น.
                          </span>
                          {session.admissionStartTime && (
                            <span className="time-pill admission-pill">
                              ประตูเปิด: {formatTime(new Date(session.admissionStartTime))} น.
                            </span>
                          )}
                        </div>
                      </header>

                      <div className="ticket-types-table-wrapper">
                        <table className="ticket-types-table">
                          <thead>
                            <tr>
                              <th scope="col">ประเภทบัตร</th>
                              <th scope="col">รายละเอียด</th>
                              <th scope="col" className="text-right">ราคา</th>
                              <th scope="col" className="text-center">สถานะ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ticketTypes.map((tt: TicketType) => {
                              const isAvailable = tt.quota > 0;
                              return (
                                <tr key={tt.id}>
                                  <td className="ticket-name-cell">
                                    <strong>{tt.name}</strong>
                                  </td>
                                  <td className="ticket-desc-cell">
                                    {tt.description || 'บัตรยืนเข้าชมการแสดง'}
                                  </td>
                                  <td className="ticket-price-cell text-right">
                                    <span className="price-num">{formatBaht(tt.price)}</span>
                                  </td>
                                  <td className="ticket-status-cell text-center">
                                    {isAvailable ? (
                                      <span className="status-badge available-badge mini">
                                        เปิดจำหน่าย
                                      </span>
                                    ) : (
                                      <span className="status-badge sold-out-badge mini">
                                        บัตรหมด
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Ticket selection, guest verification and 15-minute reservation flow (TASK-011, TASK-012) */}
          <TicketReservationFlow
            eventId={event.id}
            limitPerOrder={event.limitPerOrder}
            sessions={sessions}
          />

          {/* Booking terms reminder */}
          <section className="booking-notice-card">
            <div className="notice-icon"><InfoIcon /></div>
            <div>
              <h3>ข้อควรทราบก่อนการสั่งซื้อ</h3>
              <ul>
                <li>การซื้อบัตรบน TICKET ไม่ต้องสมัครสมาชิก ใช้เพียงอีเมลและเบอร์โทรศัพท์</li>
                <li>เมื่อทำการเลือกบัตร ระบบจะกันบัตรไว้ให้เป็นเวลา 15 นาที เพื่อดำเนินการชำระเงิน</li>
                <li>ชำระเงินผ่านระบบ PromptPay QR Code และรับบัตรดิจิทัลแยกใบทางอีเมลทันทีหลังชำระสำเร็จ</li>
              </ul>
              <div className="notice-links">
                <Link href="/terms" className="text-link">อ่านเงื่อนไขการซื้อและรับบัตรฉบับเต็ม &rarr;</Link>
              </div>
            </div>
          </section>
        </div>

        {/* Right column: Sticky summary & purchase box (D-09) */}
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
                ระบบจำหน่ายบัตรรองรับการซื้อแบบ Guest และชำระผ่าน PromptPay QR
              </p>
              <div className="sidebar-action-box">
                <a
                  href="#sessions-title"
                  className="primary-button button-link sidebar-buy-button"
                >
                  เลือกรอบการแสดง
                </a>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile sticky bottom bar (D-09) */}
      <aside className="mobile-bottom-bar" aria-label="แถบดำเนินการบนมือถือ">
        <div className="mobile-bar-info">
          <span className="mobile-bar-title">{event.title}</span>
          <span className="mobile-bar-hint">จำกัด {event.limitPerOrder} ใบ/คำสั่งซื้อ</span>
        </div>
        <a href="#sessions-title" className="primary-button mobile-bar-button">
          เลือกรอบบัตร
        </a>
      </aside>
    </div>
  );
}
