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
      {sessions.map((session, index) => {
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
                <div className="session-round-pill">
                  รอบที่ {index + 1}
                </div>
                <div>
                  <h3 className="session-accordion-date">
                    {formatDate(startTime)}
                  </h3>
                  <div className="session-accordion-meta">
                    <span className="session-meta-pill">
                      <ClockIcon style={{ width: '15px', height: '15px' }} />
                      เวลาแสดง: {formatTime(startTime)} – {formatTime(endTime)} น.
                    </span>
                    {session.admissionStartTime && (
                      <span className="session-meta-pill session-meta-admission">
                        ประตูเปิด: {formatTime(new Date(session.admissionStartTime))} น.
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
                        <th scope="col" className="text-center">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketTypes.map(tt => {
                        const isAvailable = tt.quota > 0;
                        return (
                          <tr key={tt.id}>
                            <td className="ticket-name-cell">
                              <strong>{tt.name}</strong>
                            </td>
                            <td className="ticket-desc-cell">
                              {tt.description || 'บัตรเข้าชมการแสดงตามโซนที่ระบุ'}
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
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
