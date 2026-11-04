'use client';

import { useState } from 'react';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { ClockIcon, ChevronDownIcon } from './icons';

export interface TicketType {
  id: string;
  name: string;
  price: number;
  quota: number;
  description?: string;
}

export interface EventSession {
  id: string;
  startTime: string | Date;
  endTime: string | Date;
  admissionStartTime?: string | Date | null;
  admissionEndTime?: string | Date | null;
  ticketTypes: TicketType[];
}

interface EventSessionsAccordionProps {
  sessions: EventSession[];
}

export function EventSessionsAccordion({ sessions }: EventSessionsAccordionProps) {
  // First session open by default
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(() => {
    if (sessions.length === 0) return {};
    return { [sessions[0].id]: true };
  });

  const toggleSession = (sessionId: string) => {
    setOpenIds(prev => ({
      ...prev,
      [sessionId]: !prev[sessionId],
    }));
  };

  if (sessions.length === 0) {
    return (
      <div className="empty-sessions-notice">
        <p>ยังไม่มีรอบการแสดงที่เปิดให้จำหน่ายในขณะนี้</p>
      </div>
    );
  }

  return (
    <div className="sessions-accordion-list" data-testid="sessions-accordion">
      {sessions.map(session => {
        const isOpen = Boolean(openIds[session.id]);
        const startTime = new Date(session.startTime);
        const endTime = new Date(session.endTime);
        const ticketTypes = session.ticketTypes || [];

        // Calculate min & max price
        const prices = ticketTypes.map(t => Number(t.price)).filter(p => !Number.isNaN(p));
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
        const priceLabel = minPrice === maxPrice
          ? formatBaht(minPrice)
          : `${formatBaht(minPrice)} – ${formatBaht(maxPrice)}`;

        return (
          <article
            key={session.id}
            className={`session-accordion-card ${isOpen ? 'session-accordion-open' : ''}`}
          >
            <button
              type="button"
              className="session-accordion-trigger"
              onClick={() => toggleSession(session.id)}
              aria-expanded={isOpen}
              aria-controls={`session-panel-${session.id}`}
            >
              <div className="session-trigger-left">
                <div>
                  <h3 className="session-accordion-date">
                    {formatDate(startTime)}
                  </h3>
                  <div className="session-accordion-meta">
                    <span className="session-meta-time-text">
                      <ClockIcon style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                      <span>เวลาแสดง: {formatTime(startTime)} – {formatTime(endTime)} น.</span>
                    </span>
                    {session.admissionStartTime && (
                      <span className="session-meta-admission-text">
                        (ประตูเปิด {formatTime(new Date(session.admissionStartTime))} น.)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="session-trigger-right">
                <div className="session-price-summary">
                  <span className="session-price-caption">ราคาบัตร</span>
                  <strong className="session-price-range">{priceLabel}</strong>
                </div>
                <div className={`session-chevron-wrap ${isOpen ? 'chevron-rotated' : ''}`}>
                  <ChevronDownIcon style={{ width: '20px', height: '20px' }} />
                </div>
              </div>
            </button>

            {isOpen && (
              <div
                id={`session-panel-${session.id}`}
                className="session-accordion-body"
              >
                <div className="ticket-types-table-wrapper">
                  <table className="ticket-types-table">
                    <thead>
                      <tr>
                        <th scope="col">ประเภทบัตร</th>
                        <th scope="col">สิทธิประโยชน์ / รายละเอียด</th>
                        <th scope="col" className="text-right">ราคา</th>
                        <th scope="col" className="text-right">คงเหลือ</th>
                        <th scope="col" className="text-center">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketTypes.map(tt => {
                        const isAvailable = tt.quota > 0;
                        return (
                          <tr key={tt.id} className={!isAvailable ? 'row-sold-out' : ''}>
                            <td className="ticket-name-cell">
                              <strong>{tt.name}</strong>
                            </td>
                            <td className="ticket-desc-cell">
                              {tt.description || 'บัตรเข้าชมการแสดงตามโซนที่ระบุ'}
                            </td>
                            <td className="ticket-price-cell text-right">
                              <span className={`price-num ${!isAvailable ? 'price-sold-out' : ''}`}>
                                {formatBaht(tt.price)}
                              </span>
                            </td>
                            <td className="ticket-quota-cell text-right">
                              {isAvailable ? (
                                <span className="quota-available-text">{tt.quota.toLocaleString()} ใบ</span>
                              ) : (
                                <span className="quota-empty-text">0 ใบ</span>
                              )}
                            </td>
                            <td className="ticket-status-cell text-center">
                              {isAvailable ? (
                                <span className="ticket-status-text status-available available-badge">
                                  เปิดจำหน่าย
                                </span>
                              ) : (
                                <span className="ticket-status-text status-sold-out sold-out-badge">
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

                {/* Mobile Responsive Cards (D-188) */}
                <div className="ticket-types-cards-mobile">
                  {ticketTypes.map(tt => {
                    const isAvailable = tt.quota > 0;
                    return (
                      <article key={`mob-${tt.id}`} className={`ticket-mobile-card ${!isAvailable ? 'row-sold-out' : ''}`}>
                        <div className="ticket-mobile-card-top">
                          <strong className="ticket-mobile-name">{tt.name}</strong>
                          <span className={`ticket-status-text ${isAvailable ? 'status-available available-badge' : 'status-sold-out sold-out-badge'}`}>
                            {isAvailable ? 'เปิดจำหน่าย' : 'บัตรหมด'}
                          </span>
                        </div>
                        <p className="ticket-mobile-desc">{tt.description || 'บัตรเข้าชมการแสดงตามโซนที่ระบุ'}</p>
                        <div className="ticket-mobile-card-bottom">
                          <div className="ticket-mobile-price-group">
                            <span className="ticket-mobile-label">ราคา</span>
                            <span className={`ticket-mobile-price ${!isAvailable ? 'price-sold-out' : ''}`}>
                              {formatBaht(tt.price)}
                            </span>
                          </div>
                          <div className="ticket-mobile-quota-group">
                            <span className="ticket-mobile-label">คงเหลือ</span>
                            <span className={isAvailable ? 'quota-available-text' : 'quota-empty-text'}>
                              {isAvailable ? `${tt.quota.toLocaleString()} ใบ` : '0 ใบ'}
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
