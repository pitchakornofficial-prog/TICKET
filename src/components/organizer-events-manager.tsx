'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircleIcon, ClockIcon } from './icons';
import { AlertIcon } from './alert-icon';
import { OrganizerMoneyReportView } from './organizer-money-report-view';

interface TicketTypeInput {
  name: string;
  price: number;
  quota: number;
}

interface SessionInput {
  startTime: string;
  endTime: string;
  ticketTypes: TicketTypeInput[];
}

interface EventItem {
  id: string;
  title: string;
  location: string;
  status: string;
  posterUrl?: string | null;
}

interface EventDetailsSession {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  ticketTypes: {
    id: string;
    name: string;
    price: number;
    quota: number;
  }[];
}

interface EventDetails {
  id: string;
  title: string;
  sessions: EventDetailsSession[];
}

export function OrganizerEventsManager() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [limitPerOrder, setLimitPerOrder] = useState(4);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [sessions] = useState<SessionInput[]>([
    {
      startTime: '2026-11-01T18:00',
      endTime: '2026-11-01T21:00',
      ticketTypes: [{ name: 'บัตรยืนทั่วไป', price: 1500, quota: 100 }],
    },
  ]);

  // Amendment modal state
  const [activeEventDetails, setActiveEventDetails] = useState<EventDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [amendmentStartTime, setAmendmentStartTime] = useState<string>('');
  const [amendmentEndTime, setAmendmentEndTime] = useState<string>('');
  const [amendmentTicketTypes, setAmendmentTicketTypes] = useState<
    { id: string; name: string; price: number; quota: number }[]
  >([]);
  const [amendmentSubmitting, setAmendmentSubmitting] = useState(false);
  const [amendmentFeedback, setAmendmentFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Cancellation modal state (AC-35, AC-108)
  const [cancelEventDetails, setCancelEventDetails] = useState<EventDetails | null>(null);
  const [loadingCancelDetails, setLoadingCancelDetails] = useState(false);
  const [selectedCancelSessionId, setSelectedCancelSessionId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Financial money report state (AC-28, AC-64, AC-77, AC-81)
  const [selectedReportEventId, setSelectedReportEventId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    let posterUrl: string | undefined;
    if (posterFile) {
      const fd = new FormData();
      fd.append('file', posterFile);
      const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
      if (upRes.ok) {
        const upData = await upRes.json();
        posterUrl = upData.url;
      }
    }

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          location,
          limitPerOrder,
          posterUrl,
          sessions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'บันทึกงานไม่สำเร็จ');
        return;
      }

      setSuccess('บันทึกงานคอนเสิร์ตสำเร็จ');
      setShowForm(false);
      setTitle('');
      setDescription('');
      setLocation('');
      setPosterFile(null);
      await loadEvents();
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('events-updated'));
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async function handleOpenAmendment(eventId: string) {
    setLoadingDetails(true);
    setAmendmentFeedback(null);
    setSelectedSessionId(null);
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) {
        setError('ไม่สามารถโหลดรายละเอียดรอบการแสดงได้');
        setLoadingDetails(false);
        return;
      }
      const data = await res.json();
      setActiveEventDetails(data.event);
      if (data.event?.sessions?.length > 0) {
        const firstSess = data.event.sessions[0];
        setSelectedSessionId(firstSess.id);
        setAmendmentStartTime('');
        setAmendmentEndTime('');
        setAmendmentTicketTypes(
          firstSess.ticketTypes.map((tt: { id: string; name: string; price: number; quota: number }) => ({
            id: tt.id,
            name: tt.name,
            price: Number(tt.price),
            quota: Number(tt.quota),
          })),
        );
      }
      setLoadingDetails(false);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      setLoadingDetails(false);
    }
  }

  function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setAmendmentStartTime('');
    setAmendmentEndTime('');
    const sess = activeEventDetails?.sessions.find(s => s.id === sessionId);
    if (sess) {
      setAmendmentTicketTypes(
        sess.ticketTypes.map(tt => ({
          id: tt.id,
          name: tt.name,
          price: Number(tt.price),
          quota: Number(tt.quota),
        })),
      );
    }
  }

  async function handleSubmitAmendment(e: React.FormEvent) {
    e.preventDefault();
    if (!activeEventDetails || !selectedSessionId) return;

    setAmendmentSubmitting(true);
    setAmendmentFeedback(null);

    try {
      const payload: {
        ticketTypes: typeof amendmentTicketTypes;
        startTime?: string;
        endTime?: string;
      } = {
        ticketTypes: amendmentTicketTypes,
      };

      if (amendmentStartTime) {
        payload.startTime = new Date(amendmentStartTime).toISOString();
      }
      if (amendmentEndTime) {
        payload.endTime = new Date(amendmentEndTime).toISOString();
      }

      const res = await fetch(
        `/api/organizer/events/${activeEventDetails.id}/sessions/${selectedSessionId}/amendments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setAmendmentFeedback({
          type: 'error',
          message: data.message || 'ไม่สามารถยื่นขอแก้ไขรอบการแสดงได้',
        });
        setAmendmentSubmitting(false);
        return;
      }

      setAmendmentFeedback({
        type: 'success',
        message: data.message || 'ยื่นคำขอแก้ไขรอบการแสดงสำเร็จ รอเจ้าของระบบอนุมัติ (AC-67)',
      });
      setAmendmentSubmitting(false);
    } catch {
      setAmendmentFeedback({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการยื่นคำขอแก้ไขรอบการแสดง',
      });
      setAmendmentSubmitting(false);
    }
  }

  async function handleOpenCancellation(eventId: string) {
    setLoadingCancelDetails(true);
    setCancelFeedback(null);
    setCancellationReason('');
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        setCancelEventDetails(data.event);
        if (data.event?.sessions?.length > 0) {
          setSelectedCancelSessionId(data.event.sessions[0].id);
        }
      }
    } finally {
      setLoadingCancelDetails(false);
    }
  }

  async function handleSubmitCancellation(e: React.FormEvent) {
    e.preventDefault();
    if (!cancelEventDetails || !selectedCancelSessionId) return;
    if (!cancellationReason.trim()) {
      setCancelFeedback({ type: 'error', message: 'กรุณาระบุเหตุผลในการขอยกเลิกรอบการแสดง' });
      return;
    }

    setCancelSubmitting(true);
    setCancelFeedback(null);

    try {
      const res = await fetch(
        `/api/organizer/events/${cancelEventDetails.id}/sessions/${selectedCancelSessionId}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: cancellationReason.trim() }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setCancelFeedback({ type: 'error', message: data.message || 'ยื่นขอยกเลิกไม่สำเร็จ' });
      } else {
        setCancelFeedback({
          type: 'success',
          message: data.message || 'ยื่นคำขอยกเลิกรอบการแสดงเรียบร้อยแล้ว รอการอนุมัติจากผู้ดูแลระบบ (AC-108)',
        });
        setCancellationReason('');
      }
    } catch {
      setCancelFeedback({ type: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setCancelSubmitting(false);
    }
  }

  return (
    <div className="organizer-events-section" style={{ marginTop: '2rem', borderTop: '1px solid var(--color-border, #333)', paddingTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>งานคอนเสิร์ตของคุณ</h2>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'ปิดแบบฟอร์ม' : '+ สร้างงานคอนเสิร์ตใหม่'}
        </button>
      </div>

      {error && <p className="form-error" style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}
      {success && <p className="form-success" style={{ color: '#22c55e', marginBottom: '1rem' }}>{success}</p>}

      {showForm && (
        <form onSubmit={handleCreateEvent} className="auth-form" style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #444', borderRadius: '4px' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>ข้อมูลคอนเสิร์ต (Draft)</h3>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="event-title">ชื่องานคอนเสิร์ต</label>
            <input
              id="event-title"
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="ชื่องาน"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="event-location">สถานที่จัดงาน</label>
            <input
              id="event-location"
              type="text"
              required
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="สถานที่"
            />
          </div>

          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="event-description">รายละเอียด</label>
            <textarea
              id="event-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="รายละเอียดงาน"
              rows={3}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="event-poster">โปสเตอร์งาน</label>
            <input
              id="event-poster"
              type="file"
              accept="image/*"
              onChange={e => setPosterFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="event-limit">จำกัดการซื้อต่อคำสั่งซื้อ (ใบ)</label>
            <input
              id="event-limit"
              type="number"
              min={1}
              value={limitPerOrder}
              onChange={e => setLimitPerOrder(Number(e.target.value))}
            />
          </div>

          <button type="submit" className="button button-primary">บันทึกข้อมูลร่าง (Draft)</button>
        </form>
      )}

      {loading ? (
        <p>กำลังโหลดรายการงาน...</p>
      ) : events.length === 0 ? (
        <p style={{ color: '#888' }}>ยังไม่มีงานคอนเสิร์ตที่สร้าง</p>
      ) : (
        <div className="events-list" style={{ display: 'grid', gap: '1rem' }}>
          {events.map(ev => (
            <div key={ev.id} className="event-card" style={{ padding: '1rem', border: '1px solid #333', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0' }}>{ev.title}</h3>
                  <p style={{ color: '#aaa', fontSize: '0.9rem', margin: '0 0 2px 0' }}>สถานที่: {ev.location}</p>
                  <p style={{ color: '#aaa', fontSize: '0.9rem', margin: 0 }}>สถานะ: {ev.status}</p>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedReportEventId(selectedReportEventId === ev.id ? null : ev.id)}
                    data-testid={`open-money-report-btn-${ev.id}`}
                    style={{
                      backgroundColor: '#0f766e',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    รายงานการเงิน (AC-28)
                  </button>

                  {ev.status === 'approved' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenAmendment(ev.id)}
                        data-testid={`open-amendment-btn-${ev.id}`}
                        style={{
                          backgroundColor: '#1848ed',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '6px 12px',
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        แก้ไขรอบ/ราคา (Amendment — AC-67)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenCancellation(ev.id)}
                        data-testid={`open-cancel-btn-${ev.id}`}
                        style={{
                          backgroundColor: '#dc2626',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '6px 12px',
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        ขอยกเลิกรอบ (Cancel — AC-35)
                      </button>
                    </>
                  )}
                </div>
              </div>

              {selectedReportEventId === ev.id && (
                <div style={{ marginTop: '1rem' }}>
                  <OrganizerMoneyReportView
                    eventId={ev.id}
                    onClose={() => setSelectedReportEventId(null)}
                  />
                </div>
              )}

              {ev.posterUrl && (
                <div style={{ marginTop: '0.5rem' }}>
                  {/* biome-ignore lint/performance/noImgElement: local prototype display */}
                  <img
                    src={ev.posterUrl}
                    alt={`โปสเตอร์ ${ev.title}`}
                    style={{ maxHeight: '120px', borderRadius: '4px', display: 'block' }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Amendment Form Modal/Section */}
      {activeEventDetails && (
        <div
          id="amendment-form-section"
          style={{
            marginTop: '2rem',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            color: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: 0 }}>
              ยื่นขอแก้ไขรอบการแสดงและราคา: {activeEventDetails.title} (AC-67, AC-109)
            </h3>
            <button
              type="button"
              onClick={() => setActiveEventDetails(null)}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              ปิดหน้าต่าง
            </button>
          </div>

          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '1rem' }}>
            เมื่อยื่นแก้ไข ข้อมูลฉบับเดิมจะยังคงเปิดขายตามปกติ (G-12) และคำขอใหม่จะมีผลเมื่อได้รับการอนุมัติจากผู้ดูแลระบบ (Owner)
          </p>

          {amendmentFeedback && (
            <div
              style={{
                backgroundColor: amendmentFeedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${amendmentFeedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '1rem',
                color: amendmentFeedback.type === 'success' ? '#166534' : '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
              }}
            >
              {amendmentFeedback.type === 'success' ? <CheckCircleIcon /> : <AlertIcon />}
              <span>{amendmentFeedback.message}</span>
            </div>
          )}

          {loadingDetails ? (
            <p>กำลังโหลดข้อมูล...</p>
          ) : (
            <form onSubmit={handleSubmitAmendment}>
              {activeEventDetails.sessions.length > 1 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="amendment-session-select" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                    เลือกรอบการแสดง
                  </label>
                  <select
                    id="amendment-session-select"
                    value={selectedSessionId || ''}
                    onChange={e => handleSelectSession(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    {activeEventDetails.sessions.map((s, idx) => (
                      <option key={s.id} value={s.id}>
                        รอบที่ {idx + 1}: {new Date(s.startTime).toLocaleString('th-TH')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reschedule Session Section (AC-38, AC-108, G-13) */}
              <div style={{ marginBottom: '1.25rem', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px', color: '#0f172a' }}>
                  ขอเลื่อนวันเวลาการแสดง (Reschedule Session — AC-38, AC-108, G-13):
                </h4>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>
                  * เวลาการแสดงเดิมจะยังคงมีผลจนกว่าผู้ดูแลระบบ (Owner) จะอนุมัติคำขอเลื่อนรอบ (G-13)
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label htmlFor="amendment-start-time" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                      วันเวลาเริ่มการแสดงใหม่
                    </label>
                    <input
                      id="amendment-start-time"
                      data-testid="amendment-start-time"
                      type="datetime-local"
                      value={amendmentStartTime}
                      onChange={e => setAmendmentStartTime(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="amendment-end-time" style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                      วันเวลาสิ้นสุดการแสดงใหม่
                    </label>
                    <input
                      id="amendment-end-time"
                      data-testid="amendment-end-time"
                      type="datetime-local"
                      value={amendmentEndTime}
                      onChange={e => setAmendmentEndTime(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
                  ปรับปรุงราคาและโควตาประเภทบัตร:
                </h4>

                <div style={{ display: 'grid', gap: '8px' }}>
                  {amendmentTicketTypes.map((tt, idx) => (
                    <div
                      key={tt.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 120px 120px',
                        gap: '8px',
                        alignItems: 'center',
                        backgroundColor: '#f8fafc',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{tt.name}</span>
                      </div>
                      <div>
                        <label htmlFor={`tt-price-${idx}`} style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>ราคา (บาท)</label>
                        <input
                          id={`tt-price-${idx}`}
                          data-testid={`amendment-price-${tt.id}`}
                          type="number"
                          min={0}
                          value={tt.price}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setAmendmentTicketTypes(prev =>
                              prev.map((item, i) => (i === idx ? { ...item, price: val } : item)),
                            );
                          }}
                          style={{ width: '100%', padding: '4px 8px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                      <div>
                        <label htmlFor={`tt-quota-${idx}`} style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>โควตา (ใบ)</label>
                        <input
                          id={`tt-quota-${idx}`}
                          data-testid={`amendment-quota-${tt.id}`}
                          type="number"
                          min={1}
                          value={tt.quota}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setAmendmentTicketTypes(prev =>
                              prev.map((item, i) => (i === idx ? { ...item, quota: val } : item)),
                            );
                          }}
                          style={{ width: '100%', padding: '4px 8px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  * โควตาใหม่ต้องไม่ต่ำกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้วในรอบนี้ (AC-109)
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  disabled={amendmentSubmitting}
                  data-testid="submit-amendment-btn"
                  style={{
                    backgroundColor: '#1848ed',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: amendmentSubmitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <ClockIcon />
                  {amendmentSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอแก้ไขรอบ (Submit Amendment)'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEventDetails(null)}
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Cancellation Form Section (AC-35, AC-108) */}
      {cancelEventDetails && (
        <div
          id="cancellation-form-section"
          data-testid="cancellation-form-section"
          style={{
            marginTop: '2rem',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            color: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: 0, color: '#b91c1c' }}>
              ขอยกเลิกรอบการแสดง: {cancelEventDetails.title} (AC-35, AC-108)
            </h3>
            <button
              type="button"
              onClick={() => setCancelEventDetails(null)}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              ปิดหน้าต่าง
            </button>
          </div>

          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '1rem' }}>
            เมื่อส่งคำขอ รอบการแสดงจะยังคงเปิดขายตามปกติจนกว่าผู้ดูแลระบบ (Owner) จะอนุมัติ (AC-108) เมื่ออนุมัติแล้ว ระบบจะหยุด checkout และสร้างรายการคืนเงินอัตโนมัติสำหรับบัตรที่ออกแล้วทั้งหมด (AC-35, AC-91)
          </p>

          {cancelFeedback && (
            <div
              data-testid="cancel-feedback-message"
              style={{
                backgroundColor: cancelFeedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${cancelFeedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '1rem',
                color: cancelFeedback.type === 'success' ? '#166534' : '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
              }}
            >
              {cancelFeedback.type === 'success' ? <CheckCircleIcon /> : <AlertIcon />}
              <span>{cancelFeedback.message}</span>
            </div>
          )}

          {loadingCancelDetails ? (
            <p>กำลังโหลดข้อมูล...</p>
          ) : (
            <form onSubmit={handleSubmitCancellation}>
              {cancelEventDetails.sessions.length > 1 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="cancel-session-select" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                    เลือกรอบการแสดงที่ต้องการยกเลิก
                  </label>
                  <select
                    id="cancel-session-select"
                    data-testid="cancel-session-select"
                    value={selectedCancelSessionId || ''}
                    onChange={e => setSelectedCancelSessionId(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    {cancelEventDetails.sessions.map((s, idx) => (
                      <option key={s.id} value={s.id}>
                        รอบที่ {idx + 1}: {new Date(s.startTime).toLocaleString('th-TH')} ({s.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="cancellation-reason" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                  เหตุผลในการขอยกเลิกรอบการแสดง *
                </label>
                <textarea
                  id="cancellation-reason"
                  data-testid="cancellation-reason-input"
                  rows={3}
                  value={cancellationReason}
                  onChange={e => setCancellationReason(e.target.value)}
                  placeholder="ระบุเหตุผล เช่น ศิลปินติดภารกิจด่วน, ปัญหาทางเทคนิคของสถานที่"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setCancelEventDetails(null)}
                  style={{
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={cancelSubmitting}
                  data-testid="submit-cancel-session-btn"
                  style={{
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: cancelSubmitting ? 'not-allowed' : 'pointer',
                    opacity: cancelSubmitting ? 0.7 : 1,
                  }}
                >
                  {cancelSubmitting ? 'กำลังส่งคำขอ...' : 'ยืนยันขอยกเลิกรอบ (AC-35, AC-108)'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
