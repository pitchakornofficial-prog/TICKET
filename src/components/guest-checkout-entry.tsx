'use client';

import { useState, useEffect, useTransition } from 'react';
import { CheckCircleIcon, ShieldCheckIcon } from './icons';
import { AlertIcon } from './alert-icon';

export interface VerifiedBuyerInfo {
  token: string;
  name: string;
  email: string;
  phone: string;
}

export function GuestCheckoutEntry({
  onVerified,
  stepNumber,
}: {
  onVerified?: (buyer: VerifiedBuyerInfo) => void;
  stepNumber?: number;
}) {
  const [step, setStep] = useState<'details' | 'otp' | 'verified'>('details');

  // Buyer details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // OTP details
  const [otpCode, setOtpCode] = useState('');
  const [requestId, setRequestId] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [expiresInSeconds, setExpiresInSeconds] = useState(0);

  // Status & error messages
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [verifiedBuyer, setVerifiedBuyer] = useState<VerifiedBuyerInfo | null>(null);
  const [isPending, startTransition] = useTransition();

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Expiration countdown timer
  useEffect(() => {
    if (expiresInSeconds <= 0) return;
    const timer = setInterval(() => {
      setExpiresInSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresInSeconds]);

  // Step 1: Request OTP
  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Validation (AC-60)
    if (!name.trim()) {
      setError('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    if (!email.trim()) {
      setError('กรุณากรอกอีเมล');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('รูปแบบอีเมลไม่ถูกต้อง');
      return;
    }
    if (!phone.trim()) {
      setError('กรุณากรอกเบอร์โทรศัพท์');
      return;
    }
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (cleanPhone.length < 9 || cleanPhone.length > 15 || !/^\+?\d+$/.test(cleanPhone)) {
      setError('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/public/checkout/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyer: { name, email, phone },
            purpose: 'checkout',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'ขอรหัส OTP ไม่สำเร็จ');
        }

        setRequestId(data.requestId);
        setCooldownSeconds(data.cooldownSeconds || 60);
        setExpiresInSeconds(data.expiresInSeconds || 300);
        setStep('otp');
        setSuccessMsg('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการขอรหัส OTP';
        setError(msg);
      }
    });
  }

  // Resend OTP
  async function handleResendOtp() {
    if (cooldownSeconds > 0) return;
    setError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/public/checkout/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyer: { name, email, phone },
            purpose: 'checkout',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'ส่งรหัส OTP ใหม่ไม่สำเร็จ');
        }

        setRequestId(data.requestId);
        setCooldownSeconds(data.cooldownSeconds || 60);
        setExpiresInSeconds(data.expiresInSeconds || 300);
        setOtpCode('');
        setSuccessMsg('ส่งรหัส OTP ใหม่ไปยังอีเมลเรียบร้อยแล้ว (รหัสเดิมถูกยกเลิกแล้ว)');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการขอรหัสใหม่';
        setError(msg);
      }
    });
  }

  // Step 2: Verify OTP
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (otpCode.trim().length !== 6) {
      setError('กรุณาระบุรหัส OTP 6 หลักให้ครบถ้วน');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/public/checkout/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            code: otpCode.trim(),
            requestId,
            purpose: 'checkout',
            buyer: { name, email, phone },
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'ยืนยันรหัส OTP ไม่สำเร็จ');
        }

        const buyerInfo: VerifiedBuyerInfo = {
          token: data.verifiedToken,
          name: data.buyer.name,
          email: data.buyer.email,
          phone: data.buyer.phone,
        };

        if (typeof window !== 'undefined' && data.verifiedToken) {
          sessionStorage.setItem('ticket_guest_otp_token', data.verifiedToken);
        }

        setVerifiedBuyer(buyerInfo);
        setStep('verified');
        setSuccessMsg('ยืนยันตัวตนสำเร็จแล้ว');
        if (onVerified) onVerified(buyerInfo);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการยืนยัน OTP';
        setError(msg);
      }
    });
  }

  return (
    <section className="checkout-verification-card" style={{ marginTop: '2rem' }} aria-labelledby="checkout-step-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
        {stepNumber ? (
          <span className="step-badge-number">{stepNumber}</span>
        ) : (
          <ShieldCheckIcon style={{ width: '24px', height: '24px', color: 'var(--blue)' }} />
        )}
        <h2 id="checkout-step-title" style={{ margin: 0, fontSize: '1.25rem' }}>
          ข้อมูลผู้ซื้อและยืนยันอีเมล (Guest Checkout)
        </h2>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
        ซื้อบัตรได้สะดวกรวดเร็วโดยไม่ต้องสมัครสมาชิก ข้อมูลนี้ใช้สำหรับส่งบัตรดิจิทัลและติดต่อเมื่อมีกรณีจำเป็น (AC-57, AC-60)
      </p>

      {/* Status Messages */}
      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.8rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.2rem',
            fontSize: '0.95rem',
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
          }}
        >
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.8rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.2rem',
            fontSize: '0.95rem',
            background: '#f0fdf4',
            color: '#166534',
            border: '1px solid #bbf7d0',
          }}
        >
          <CheckCircleIcon style={{ width: '18px', height: '18px', flexShrink: 0 }} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Step 1: Buyer Details Form */}
      {step === 'details' && (
        <form onSubmit={handleRequestOtp} noValidate style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.2rem', marginBottom: '1.5rem' }}>
            <div>
              <label htmlFor="buyer-name" style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem' }}>
                ชื่อ-นามสกุล *
              </label>
              <input
                id="buyer-name"
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="เช่น สมชาย ใจดี"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  borderRadius: '4px',
                  border: '1px solid var(--line)',
                  font: 'inherit',
                  background: 'var(--white)',
                }}
              />
            </div>

            <div>
              <label htmlFor="buyer-email" style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem' }}>
                อีเมล *
              </label>
              <input
                id="buyer-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="เช่น your-email@example.com"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  borderRadius: '4px',
                  border: '1px solid var(--line)',
                  font: 'inherit',
                  background: 'var(--white)',
                }}
              />
            </div>

            <div>
              <label htmlFor="buyer-phone" style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem' }}>
                เบอร์โทรศัพท์มือถือ *
              </label>
              <input
                id="buyer-phone"
                type="tel"
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="เช่น 0812345678"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  borderRadius: '4px',
                  border: '1px solid var(--line)',
                  font: 'inherit',
                  background: 'var(--white)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
              * ข้อมูลจำเป็นต้องครบทุกช่องเพื่อขอรหัสยืนยันตัวตน
            </p>
            <button
              type="submit"
              disabled={isPending}
              className="action-button"
              style={{
                minHeight: '44px',
                padding: '0.7rem 1.8rem',
                background: 'var(--blue)',
                color: 'var(--white)',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {isPending ? 'กำลังส่งรหัส...' : 'ขอรหัส OTP เพื่อซื้อบัตร'}
            </button>
          </div>
        </form>
      )}

      {/* Step 2: OTP Verification Form */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} noValidate style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--blue)', fontWeight: 600, textTransform: 'uppercase' }}>
              ขั้นตอนที่ 2: กรอกรหัส OTP
            </span>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.95rem' }}>
              ส่งรหัส OTP 6 หลักไปยัง <strong>{email}</strong> แล้ว (รหัสมีอายุ 5 นาที)
            </p>
            <button
              type="button"
              onClick={() => {
                setStep('details');
                setError(null);
                setSuccessMsg(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                marginTop: '0.4rem',
                color: 'var(--blue)',
                textDecoration: 'underline',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              แก้ไขข้อมูลติดต่อ
            </button>
          </div>

          <div style={{ maxWidth: '300px', marginBottom: '1.5rem' }}>
            <label htmlFor="otp-input" style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem' }}>
              รหัส OTP 6 หลัก *
            </label>
            <input
              id="otp-input"
              type="text"
              maxLength={6}
              required
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                fontSize: '1.5rem',
                letterSpacing: '0.3rem',
                textAlign: 'center',
                borderRadius: '4px',
                border: '2px solid var(--blue)',
                font: 'inherit',
                background: 'var(--white)',
              }}
            />
            {expiresInSeconds > 0 && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                รหัสหมดอายุใน: {Math.floor(expiresInSeconds / 60)}:{(expiresInSeconds % 60).toString().padStart(2, '0')} นาที
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={cooldownSeconds > 0 || isPending}
              style={{
                background: 'none',
                border: '1px solid var(--line)',
                padding: '0.6rem 1.2rem',
                borderRadius: '4px',
                fontSize: '0.9rem',
                cursor: cooldownSeconds > 0 || isPending ? 'not-allowed' : 'pointer',
                color: cooldownSeconds > 0 ? 'var(--muted)' : 'var(--black)',
              }}
            >
              {cooldownSeconds > 0 ? `ขอรหัสใหม่ได้ในอีก ${cooldownSeconds} วินาที` : 'ขอรหัส OTP ใหม่'}
            </button>

            <button
              type="submit"
              disabled={isPending || otpCode.length !== 6}
              className="action-button"
              style={{
                minHeight: '44px',
                padding: '0.7rem 1.8rem',
                background: 'var(--blue)',
                color: 'var(--white)',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: isPending || otpCode.length !== 6 ? 'not-allowed' : 'pointer',
                opacity: otpCode.length !== 6 ? 0.6 : 1,
              }}
            >
              {isPending ? 'กำลังตรวจสอบ...' : 'ยืนยันรหัส OTP'}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Verified Status */}
      {step === 'verified' && verifiedBuyer && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <CheckCircleIcon style={{ width: '24px', height: '24px', color: '#166534' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#166534' }}>
              ยืนยันอีเมลสำเร็จ (Guest Verified)
            </h3>
          </div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.95rem', color: '#166534' }}>
            อีเมลของคุณได้รับการยืนยันแล้ว สามารถดำเนินการเลือกจำนวนบัตรและทำการกันบัตรในขั้นตอนต่อไปได้
          </p>
          <div style={{ background: 'var(--white)', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '1rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <div><strong>ชื่อผู้ซื้อ:</strong> <span id="verified-buyer-name">{verifiedBuyer.name}</span></div>
            <div><strong>อีเมล:</strong> <span id="verified-buyer-email">{verifiedBuyer.email}</span></div>
            <div><strong>เบอร์โทรศัพท์:</strong> <span id="verified-buyer-phone">{verifiedBuyer.phone}</span></div>
          </div>
        </div>
      )}
    </section>
  );
}
