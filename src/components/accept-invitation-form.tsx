'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertIcon } from './alert-icon';

export function AcceptInvitationForm({ token, defaultEmail }: { token: string; defaultEmail?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    const password = String(data.get('password') || '');
    const confirmPassword = String(data.get('confirmPassword') || '');

    if (!name) {
      setError('กรุณาระบุชื่อผู้จัดงาน');
      return;
    }
    if (password.length < 15 || password.length > 128) {
      setError('รหัสผ่านต้องมีความยาว 15–128 ตัวอักษร');
      return;
    }
    if (password !== confirmPassword) {
      setError('รหัสผ่านยืนยันไม่ตรงกัน');
      return;
    }

    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.replace('/login');
        }, 2000);
      } else {
        setError(result.message || 'คำเชิญหมดอายุหรือไม่ถูกต้อง');
      }
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="login-form">
        <p className="form-success" role="status">
          ตั้งบัญชีผู้จัดงานสำเร็จ กำลังนำคุณไปยังหน้าเข้าสู่ระบบ…
        </p>
        <div className="login-links">
          <a href="/login" className="login-forgot">ไปหน้าเข้าสู่ระบบ</a>
        </div>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      {defaultEmail && (
        <div className="form-field">
          <label htmlFor="invitation-email">อีเมลคำเชิญ</label>
          <input
            id="invitation-email"
            type="email"
            value={defaultEmail}
            disabled
            className="input-disabled"
          />
        </div>
      )}

      <div className="form-field">
        <label htmlFor="invitation-name">ชื่อผู้จัดงาน / องค์กร</label>
        <input
          id="invitation-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          disabled={pending}
          placeholder="ชื่อผู้จัดงาน"
        />
      </div>

      <div className="form-field">
        <label htmlFor="invitation-password">รหัสผ่าน (อย่างน้อย 15 ตัวอักษร)</label>
        <input
          id="invitation-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={15}
          maxLength={128}
          disabled={pending}
        />
      </div>

      <div className="form-field">
        <label htmlFor="invitation-confirm-password">ยืนยันรหัสผ่าน</label>
        <input
          id="invitation-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={15}
          maxLength={128}
          disabled={pending}
        />
      </div>

      {error ? (
        <p id="accept-error" className="form-error" role="alert">
          <AlertIcon />
          <span>{error}</span>
        </p>
      ) : null}

      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? 'กำลังสร้างบัญชี…' : 'ยอมรับคำเชิญและสร้างบัญชี'}
      </button>

      <div className="login-links">
        <a href="/login" className="login-forgot">กลับหน้าเข้าสู่ระบบ</a>
      </div>
    </form>
  );
}
