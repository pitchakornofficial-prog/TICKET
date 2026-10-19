'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertIcon } from './alert-icon';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') || '');
    const confirmPassword = String(data.get('confirmPassword') || '');

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
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password, token }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.replace('/login');
        }, 2000);
      } else {
        setError(result.message || 'ลิงก์ตั้งรหัสผ่านหมดอายุหรือไม่ถูกต้อง');
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
          ตั้งรหัสผ่านใหม่สำเร็จ กำลังนำคุณไปยังหน้าเข้าสู่ระบบ…
        </p>
        <div className="login-links">
          <a href="/login">ไปที่หน้าเข้าสู่ระบบทันที</a>
        </div>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit} aria-busy={pending}>
      <div>
        <label htmlFor="password">รหัสผ่านใหม่ (อย่างน้อย 15 ตัวอักษร)</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={15}
          maxLength={128}
          aria-describedby={error ? 'reset-error' : undefined}
        />
      </div>
      <div>
        <label htmlFor="confirmPassword">ยืนยันรหัสผ่านใหม่</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={15}
          maxLength={128}
          aria-describedby={error ? 'reset-error' : undefined}
        />
      </div>
      {error && <p id="reset-error" className="form-error" role="alert"><AlertIcon />{error}</p>}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
      </button>
      <div className="login-links">
        <a href="/login">กลับหน้าเข้าสู่ระบบ</a>
      </div>
    </form>
  );
}
