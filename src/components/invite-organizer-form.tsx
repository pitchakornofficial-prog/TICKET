'use client';

import { useState } from 'react';

export function InviteOrganizerForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');

    try {
      const res = await fetch('/api/auth/invite-organizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.message || 'ส่งคำเชิญไม่สำเร็จ');
        return;
      }

      setStatus('success');
      setMessage(`ส่งคำเชิญไปยัง ${email} สำเร็จ ลิงก์มีอายุ 48 ชั่วโมง`);
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    }
  }

  return (
    <div className="invite-organizer-section" style={{ marginTop: '2rem', borderTop: '1px solid var(--color-border, #333)', paddingTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>เชิญผู้จัดงานใหม่</h2>
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="form-group">
          <label htmlFor="organizer-email">อีเมลผู้จัดงาน</label>
          <input
            id="organizer-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="organizer@example.com"
            required
            disabled={status === 'submitting'}
          />
        </div>

        {status === 'error' && (
          <div id="invite-error" className="form-error" role="alert" style={{ color: '#ef4444', marginBottom: '1rem' }}>
            {message}
          </div>
        )}

        {status === 'success' && (
          <div id="invite-success" className="form-success" role="status" style={{ color: '#22c55e', marginBottom: '1rem' }}>
            {message}
          </div>
        )}

        <button
          type="submit"
          className="button button-primary"
          disabled={status === 'submitting'}
        >
          {status === 'submitting' ? 'กำลังส่งคำเชิญ...' : 'ส่งคำเชิญผู้จัดงาน'}
        </button>
      </form>
    </div>
  );
}
