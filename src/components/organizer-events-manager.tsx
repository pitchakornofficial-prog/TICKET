'use client';

import { useState, useEffect, useCallback } from 'react';

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
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
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
              <h3 style={{ fontSize: '1.1rem' }}>{ev.title}</h3>
              <p style={{ color: '#aaa', fontSize: '0.9rem' }}>สถานที่: {ev.location}</p>
              <p style={{ color: '#aaa', fontSize: '0.9rem' }}>สถานะ: {ev.status}</p>
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
    </div>
  );
}
