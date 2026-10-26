'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertIcon } from './alert-icon';
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from './icons';

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
    <form className="login-form modern-login-form" onSubmit={submit} aria-busy={pending}>
      <div className="login-field-group">
        <label htmlFor="email" className="login-field-label">อีเมล</label>
        <div className="login-input-wrapper">
          <MailIcon className="login-input-prefix-icon" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            placeholder="organizer@ticket.local"
            className="login-input with-prefix-icon"
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>
      </div>

      <div className="login-field-group">
        <div className="login-field-label-row">
          <label htmlFor="password" className="login-field-label">รหัสผ่าน</label>
          <a href="/forgot-password" className="login-forgot-link">ลืมรหัสผ่าน?</a>
        </div>
        <div className="login-input-wrapper">
          <LockIcon className="login-input-prefix-icon" />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            maxLength={128}
            placeholder="••••••••••••"
            className="login-input with-prefix-icon with-suffix-btn"
            aria-describedby={error ? 'login-error' : undefined}
          />
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      {error && (
        <p id="login-error" className="form-error login-error-box" role="alert">
          <AlertIcon />
          <span>{error}</span>
        </p>
      )}

      <button className="primary-button login-submit-btn" type="submit" disabled={pending}>
        {pending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </button>
    </form>
  );
}
