'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertIcon } from './alert-icon';

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError('');
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(data.get('email')).trim(), password: data.get('password'), rememberMe: false }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่'
          : response.status >= 500 ? 'ระบบเข้าสู่ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง'
          : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่');
        return;
      }
      router.replace('/back-office'); router.refresh();
    } catch { setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'); }
    finally { setPending(false); }
  }
  return (
    <form className="login-form" onSubmit={submit} aria-busy={pending}>
      <div><label htmlFor="email">อีเมล</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} aria-describedby={error ? 'login-error' : undefined} /></div>
      <div><label htmlFor="password">รหัสผ่าน</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} aria-describedby={error ? 'login-error' : undefined} /></div>
      {error && <p id="login-error" className="form-error" role="alert"><AlertIcon />{error}</p>}
      <button className="primary-button" type="submit" disabled={pending}>{pending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
    </form>
  );
}
