'use client';

import { useState, useEffect, useCallback } from 'react';

interface PendingSession {
  sessionId: string;
  startTime: string;
  endTime: string;
  sessionStatus: string;
  eventId: string;
  eventTitle: string;
  location: string;
  posterUrl?: string | null;
  organizerName: string;
  organizerEmail: string;
  ticketTypeCount: string | number;
}

export function OwnerSessionApprovalManager() {
  const [sessions, setSessions] = useState<PendingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.pendingSessions || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function handleApprove(sessionId: string, eventTitle: string) {
    setError('');
    setActionMessage('');
    try {
      const res = await fetch('/api/owner/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'อนุมัติไม่สำเร็จ');
        return;
      }
      setActionMessage(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`);
      await loadPending();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  return (
    <div className="owner-approvals-section" style={{ marginTop: '2rem', borderTop: '1px solid var(--color-border, #333)', paddingTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>รอบการแสดงที่รอการอนุมัติ (Owner Review)</h2>
      {error && <p className="form-error" style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}
      {actionMessage && <p className="form-success" style={{ color: '#22c55e', marginBottom: '1rem' }}>{actionMessage}</p>}

      {loading ? (
        <p>กำลังโหลดรายการรออนุมัติ...</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: '#888' }}>ไม่มีรอบการแสดงที่รอการอนุมัติในขณะนี้</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {sessions.map(s => (
            <div key={s.sessionId} className="pending-session-card" style={{ padding: '1rem', border: '1px solid #444', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem' }}>{s.eventTitle}</h3>
                  <p style={{ color: '#aaa', fontSize: '0.9rem' }}>ผู้จัดงาน: {s.organizerName} ({s.organizerEmail})</p>
                  <p style={{ color: '#aaa', fontSize: '0.9rem' }}>สถานที่: {s.location}</p>
                  <p style={{ color: '#aaa', fontSize: '0.9rem' }}>เวลา: {new Date(s.startTime).toLocaleString('th-TH')} - {new Date(s.endTime).toLocaleString('th-TH')}</p>
                </div>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => handleApprove(s.sessionId, s.eventTitle)}
                >
                  อนุมัติรอบนี้
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
