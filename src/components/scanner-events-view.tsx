'use client';

import { useState, useEffect, useCallback } from 'react';
import { TicketIcon } from './ticket-icon';
import { CalendarIcon, MapPinIcon, ClockIcon } from './icons';
import { formatDate, formatTime } from '@/lib/locale';
import { ScannerAdmissionTerminal } from './scanner-admission-terminal';

interface ScannerSession {
  id: string;
  startTime: string;
  endTime: string;
  admissionStartTime?: string | null;
  admissionEndTime?: string | null;
  status: string;
}

interface ScannerEvent {
  id: string;
  title: string;
  location: string;
  posterUrl: string | null;
  status: string;
  assignedAt: string;
  isPrimary?: boolean;
  primaryScannerId?: string | null;
  primaryScannerName?: string | null;
  sessions: ScannerSession[];
}

export function ScannerEventsView() {
  const [events, setEvents] = useState<ScannerEvent[]>([]);
  const [currentScanner, setCurrentScanner] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSession, setActiveSession] = useState<{
    eventId: string;
    eventTitle: string;
    isPrimary?: boolean;
    primaryScannerName?: string | null;
    session: ScannerSession;
  } | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/scanner/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        if (data.currentScanner) {
          setCurrentScanner(data.currentScanner);
        }
      } else {
        setError('ไม่สามารถโหลดข้อมูลงานที่ได้รับมอบหมายได้');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  if (activeSession) {
    return (
      <ScannerAdmissionTerminal
        eventId={activeSession.eventId}
        eventTitle={activeSession.eventTitle}
        sessionId={activeSession.session.id}
        startTime={activeSession.session.startTime}
        endTime={activeSession.session.endTime}
        admissionStartTime={activeSession.session.admissionStartTime}
        admissionEndTime={activeSession.session.admissionEndTime}
        isPrimary={activeSession.isPrimary}
        primaryScannerName={activeSession.primaryScannerName}
        scannerId={currentScanner?.id}
        scannerName={currentScanner?.name}
        onClose={() => setActiveSession(null)}
      />
    );
  }

  return (
    <section className="form-card scanner-workspace-card" aria-labelledby="scanner-heading">
      <h2 id="scanner-heading">งานคอนเสิร์ตที่ได้รับมอบหมาย</h2>
      <p className="card-caption">
        รายการงานและรอบการแสดงที่คุณมีสิทธิ์ในการสแกนบัตรเข้างาน (AC-08, AC-09)
      </p>

      {error && (
        <div className="status-banner error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className="loading-text">กำลังโหลดรายการงาน...</p>
      ) : events.length === 0 ? (
        <div className="empty-sub-card">
          <TicketIcon />
          <p>คุณยังไม่ได้รับมอบหมายให้สแกนบัตรในงานใด</p>
        </div>
      ) : (
        <div className="scanner-events-grid">
          {events.map(event => (
            <article key={event.id} className="scanner-event-card">
              <div className="scanner-event-header">
                <h3>{event.title}</h3>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {event.isPrimary ? (
                    <span
                      className="status-badge approved"
                      data-testid={`event-primary-badge-${event.id}`}
                    >
                      เครื่องหลักประจำงาน (Primary — AC-94)
                    </span>
                  ) : (
                    <span
                      className="status-badge"
                      style={{ backgroundColor: '#f1f5f9', color: '#475569' }}
                      data-testid={`event-secondary-badge-${event.id}`}
                    >
                      เครื่องรอง (Secondary)
                    </span>
                  )}
                  <span className={`status-badge ${event.status === 'approved' ? 'open' : 'pending'}`}>
                    {event.status === 'approved' ? 'อนุมัติแล้ว' : 'ฉบับร่าง'}
                  </span>
                </div>
              </div>

              <div className="scanner-event-meta">
                <span className="meta-item">
                  <MapPinIcon />
                  <span>{event.location}</span>
                </span>
              </div>

              <div className="scanner-sessions-list">
                <h4>รอบการแสดงที่ต้องสแกน ({event.sessions.length} รอบ)</h4>
                <ul>
                  {event.sessions.map(s => (
                    <li key={s.id} className="session-item" id={`scanner-session-row-${s.id}`}>
                      <div className="session-time-info">
                        <CalendarIcon />
                        <span>{formatDate(new Date(s.startTime))}</span>
                        <ClockIcon />
                        <span>
                          {formatTime(new Date(s.startTime))} – {formatTime(new Date(s.endTime))}
                        </span>
                      </div>
                      <div className="session-actions-area">
                        <span className={`status-badge mini ${s.status === 'approved' ? 'open' : 'pending'}`}>
                          {s.status === 'approved' ? 'พร้อมสแกน' : 'รออนุมัติ'}
                        </span>
                        {s.status === 'approved' && (
                          <button
                            type="button"
                            id={`open-terminal-btn-${s.id}`}
                            className="button button-primary mini-btn"
                            onClick={() =>
                              setActiveSession({
                                eventId: event.id,
                                eventTitle: event.title,
                                isPrimary: event.isPrimary,
                                primaryScannerName: event.primaryScannerName,
                                session: s,
                              })
                            }
                          >
                            เปิดเครื่องสแกน
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
