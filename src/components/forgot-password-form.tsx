'use client';

import { useState, type FormEvent } from 'react';
import { AlertIcon } from './alert-icon';

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    if (!email) return;

    setPending(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo: '/reset-password' }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setMessage(result.message || 'หากอีเมลนี้มีอยู่ในระบบ ลิงก์ตั้งรหัสผ่านใหม่จะถูกส่งไปยังอีเมลของคุณ');
      } else {
        setError(result.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit} aria-busy={pending}>
      <div>
        <label htmlFor="email">อีเมลบัญชีหลังบ้าน</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          aria-describedby={error ? 'forgot-error' : message ? 'forgot-success' : undefined}
        />
      </div>
      {error && <p id="forgot-error" className="form-error" role="alert"><AlertIcon />{error}</p>}
      {message && <p id="forgot-success" className="form-success" role="status">{message}</p>}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? 'กำลังส่งข้อมูล…' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
      </button>
      <div className="login-links">
        <a href="/login">กลับหน้าเข้าสู่ระบบ</a>
      </div>
    </form>
  );
}
