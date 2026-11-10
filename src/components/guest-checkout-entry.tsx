'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { AcademicCapIcon, CheckCircleIcon, ShieldCheckIcon, SparklesIcon } from './icons';
import { AlertIcon } from './alert-icon';

export interface VerifiedBuyerInfo {
  token: string;
  name: string;
  email: string;
  phone: string;
}

export interface BuyerQuotaInfo {
  alreadyPurchased: number;
  limitPerOrder: number;
  remainingQuota: number;
  email?: string;
}

export interface OrderSummaryDetails {
  sessionText?: string;
  ticketsText?: string;
}

const OTP_BOX_KEYS = ['otp-d0', 'otp-d1', 'otp-d2', 'otp-d3', 'otp-d4', 'otp-d5'] as const;

export function isUbuEmail(emailAddress: string): boolean {
  if (!emailAddress) return false;
  return /@(?:[a-zA-Z0-9-]+\.)*ubu\.ac\.th$/i.test(emailAddress.trim());
}

export function GuestCheckoutEntry({
  eventId,
  totalTickets = 0,
  onVerified,
  onResetVerification,
  onQuotaExceeded,
  onStepChange,
  stepNumber,
  hasSelectedTickets = true,
  summaryDetails: _summaryDetails,
}: {
  eventId?: string;
  totalTickets?: number;
  onVerified?: (buyer: VerifiedBuyerInfo, quota?: BuyerQuotaInfo, autoProceed?: boolean) => void;
  onResetVerification?: () => void;
  onQuotaExceeded?: (quota: BuyerQuotaInfo) => void;
  onStepChange?: (step: 'details' | 'otp' | 'verified') => void;
  stepNumber?: number;
  hasSelectedTickets?: boolean;
  summaryDetails?: OrderSummaryDetails;
}) {
  const [step, setStep] = useState<'details' | 'otp' | 'verified'>('details');

  // Buyer details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pdpaAccepted, setPdpaAccepted] = useState(true);

  // OTP details
  const [otpCode, setOtpCode] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [requestId, setRequestId] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [expiresInSeconds, setExpiresInSeconds] = useState(0);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

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

    // Gating check (D-45)
    if (!hasSelectedTickets) {
      setError('กรุณาเลือกจำนวนบัตรอย่างน้อย 1 ใบ ในขั้นตอนที่ 1 ก่อนขอรหัส OTP');
      return;
    }

    if (!pdpaAccepted) {
      setError('กรุณากดยินยอมตามนโยบายความเป็นส่วนตัว (PDPA) ก่อนดำเนินการต่อ');
      return;
    }

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
            eventId,
            requestedQuantity: totalTickets,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'CUMULATIVE_LIMIT_EXCEEDED' && onQuotaExceeded) {
            onQuotaExceeded({
              alreadyPurchased: data.alreadyPurchased,
              limitPerOrder: data.limitPerOrder,
              remainingQuota: data.remainingQuota ?? 0,
              email: data.email || email,
            });
          }
          throw new Error(data.message || 'ขอรหัส OTP ไม่สำเร็จ');
        }

        setRequestId(data.requestId);
        setCooldownSeconds(data.cooldownSeconds || 60);
        setExpiresInSeconds(data.expiresInSeconds || 300);
        if (data.devOtpCode) {
          setDevOtpCode(data.devOtpCode);
        }
        setOtpCode('');
        setOtpDigits(['', '', '', '', '', '']);
        setStep('otp');
        if (onStepChange) onStepChange('otp');
        setSuccessMsg('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว');
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 50);
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
            eventId,
            requestedQuantity: totalTickets,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'CUMULATIVE_LIMIT_EXCEEDED' && onQuotaExceeded) {
            onQuotaExceeded({
              alreadyPurchased: data.alreadyPurchased,
              limitPerOrder: data.limitPerOrder,
              remainingQuota: data.remainingQuota ?? 0,
              email: data.email || email,
            });
          }
          throw new Error(data.message || 'ส่งรหัส OTP ใหม่ไม่สำเร็จ');
        }

        setRequestId(data.requestId);
        setCooldownSeconds(data.cooldownSeconds || 60);
        setExpiresInSeconds(data.expiresInSeconds || 300);
        if (data.devOtpCode) {
          setDevOtpCode(data.devOtpCode);
        }
        setOtpCode('');
        setOtpDigits(['', '', '', '', '', '']);
        setSuccessMsg('ส่งรหัส OTP ใหม่ไปยังอีเมลเรียบร้อยแล้ว (รหัสเดิมถูกยกเลิกแล้ว)');
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 50);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการขอรหัสใหม่';
        setError(msg);
      }
    });
  }

  function handleDigitChange(idx: number, rawVal: string) {
    const digitsOnly = rawVal.replace(/\D/g, '');

    if (digitsOnly.length > 2) {
      // Paste or Playwright fill with multiple characters
      const pasted = digitsOnly.slice(0, 6);
      const nextDigits = ['', '', '', '', '', ''];
      for (let i = 0; i < pasted.length; i++) {
        nextDigits[i] = pasted[i];
      }
      setOtpDigits(nextDigits);
      setOtpCode(nextDigits.join(''));
      const focusTarget = Math.min(5, pasted.length < 6 ? pasted.length : 5);
      inputRefs.current[focusTarget]?.focus();
      return;
    }

    const nextDigits = [...otpDigits];
    const char = digitsOnly.slice(-1);
    nextDigits[idx] = char;
    setOtpDigits(nextDigits);
    setOtpCode(nextDigits.join(''));

    if (char && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!otpDigits[idx] && idx > 0) {
        e.preventDefault();
        const nextDigits = [...otpDigits];
        nextDigits[idx - 1] = '';
        setOtpDigits(nextDigits);
        setOtpCode(nextDigits.join(''));
        inputRefs.current[idx - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const nextDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      nextDigits[i] = pasted[i];
    }
    setOtpDigits(nextDigits);
    setOtpCode(nextDigits.join(''));
    const focusTarget = Math.min(5, pasted.length < 6 ? pasted.length : 5);
    inputRefs.current[focusTarget]?.focus();
  }

  // Step 2: Execute verified OTP in modal (D-188)
  async function handleExecuteVerifyOtp(autoProceed = true) {
    setError(null);
    setSuccessMsg(null);

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
            eventId,
            buyer: { name, email, phone },
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setIsConfirmModalOpen(false);
          if (data.code === 'CUMULATIVE_LIMIT_EXCEEDED' && onQuotaExceeded) {
            onQuotaExceeded({
              alreadyPurchased: data.alreadyPurchased,
              limitPerOrder: data.limitPerOrder,
              remainingQuota: data.remainingQuota ?? 0,
              email: data.email || email,
            });
          }
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

        setIsConfirmModalOpen(false);
        setVerifiedBuyer(buyerInfo);
        setStep('verified');
        if (onStepChange) onStepChange('verified');
        setSuccessMsg('ยืนยันตัวตนสำเร็จแล้ว');
        if (onVerified) {
          if (autoProceed) {
            onVerified(buyerInfo, data.buyerQuota, true);
          } else {
            onVerified(buyerInfo, data.buyerQuota, false);
          }
        }
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

      <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
        ซื้อบัตรได้สะดวกรวดเร็วโดยไม่ต้องสมัครสมาชิก ข้อมูลนี้ใช้สำหรับส่งบัตรดิจิทัลและติดต่อเมื่อมีกรณีจำเป็น (AC-57, AC-60)
      </p>

      {/* UBU Privilege Banner (D-37) */}
      <div className="ubu-privilege-card">
        <div className="ubu-privilege-card-header">
          <div className="ubu-privilege-badge">
            <AcademicCapIcon />
            <span>UBU Privilege</span>
          </div>
          <strong className="ubu-privilege-title">สิทธิพิเศษสำหรับชาวมหาวิทยาลัยอุบลราชธานี</strong>
        </div>
        <p className="ubu-privilege-desc">
          ใช้อีเมลสถาบัน (@ubu.ac.th หรือ @*.ubu.ac.th) เพื่อรับส่วนลดค่าบัตรพิเศษ 15% ทันทีสำหรับบัตรทุกใบในคำสั่งซื้อนี้ (จำกัดสิทธิ์สูงสุด 2 ใบ)
        </p>
      </div>

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

      {/* Step 1: Streamlined Full-Width Buyer Details Form (D-188) */}
      {step === 'details' && (
        <form onSubmit={handleRequestOtp} noValidate className="guest-step-form">
          <div className="guest-fields-stack">
            <div className="guest-field-group">
              <label htmlFor="buyer-name" className="guest-field-label">
                ชื่อ-นามสกุล *
              </label>
              <input
                id="buyer-name"
                type="text"
                required
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="เช่น สมชาย ใจดี"
                className="guest-step-input"
              />
            </div>

            <div className="guest-field-group">
              <label htmlFor="buyer-phone" className="guest-field-label">
                เบอร์โทรศัพท์มือถือ *
              </label>
              <input
                id="buyer-phone"
                type="tel"
                required
                value={phone}
                onChange={e => {
                  setPhone(e.target.value);
                  setError(null);
                }}
                placeholder="เช่น 0812345678"
                className="guest-step-input"
              />
            </div>

            <div className="guest-field-group">
              <label htmlFor="buyer-email" className="guest-field-label">
                อีเมลสำหรับรับบัตรและรหัส OTP *
              </label>
              <input
                id="buyer-email"
                aria-label="อีเมลสำหรับรับบัตรและรหัส OTP * อีเมล *"
                type="email"
                required
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setError(null);
                  if (onResetVerification) onResetVerification();
                }}
                placeholder="เช่น your-email@ubu.ac.th หรือ user@example.com"
                className="guest-step-input"
                style={{
                  borderColor: isUbuEmail(email) ? 'var(--blue)' : undefined,
                  boxShadow: isUbuEmail(email) ? '0 0 0 3px rgba(24, 72, 237, 0.12)' : undefined,
                }}
              />
              {isUbuEmail(email) && (
                <div className="ubu-detect-notice" role="status">
                  <SparklesIcon style={{ width: '15px', height: '15px', color: 'var(--blue)', flexShrink: 0 }} />
                  <span>ตรวจพบอีเมลสถาบัน ม.อุบลฯ (@ubu.ac.th) — รับสิทธิ์ราคาพิเศษ 99 บาท/ใบ เมื่อยืนยัน OTP</span>
                </div>
              )}
            </div>

            {/* PDPA Consent Checkbox (D-188) */}
            <div className="pdpa-consent-row">
              <input
                type="checkbox"
                id="pdpa-consent-checkbox"
                checked={pdpaAccepted}
                onChange={e => {
                  setPdpaAccepted(e.target.checked);
                  setError(null);
                }}
                className="pdpa-checkbox"
                required
              />
              <label htmlFor="pdpa-consent-checkbox" className="pdpa-label">
                ฉันได้อ่านและยอมรับ <a href="/privacy" target="_blank" rel="noopener noreferrer" className="pdpa-link">นโยบายความเป็นส่วนตัว (PDPA)</a> และเงื่อนไขการให้บริการ
              </label>
            </div>
          </div>

          <div className="guest-form-submit-row">
            {!hasSelectedTickets ? (
              <p className="guest-ticket-warn-notice">
                <AlertIcon />
                <span>กรุณาเลือกจำนวนบัตรอย่างน้อย 1 ใบ ในขั้นตอนที่ 1 ก่อนขอรหัส OTP</span>
              </p>
            ) : null}
            <button
              type="submit"
              disabled={isPending || !hasSelectedTickets || !pdpaAccepted}
              className="action-button guest-submit-otp-btn"
            >
              {isPending ? 'กำลังส่งรหัส...' : 'ขอรหัส OTP เพื่อซื้อบัตร'}
            </button>
          </div>
        </form>
      )}

      {/* Step 2: Full Modal Dialog for OTP Verification (D-188) */}
      {step === 'otp' && (
        <div className="otp-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="otp-modal-title">
          <div className="otp-modal-card">
            <div className="otp-modal-header">
              <div className="otp-modal-icon-wrap">
                <ShieldCheckIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 id="otp-modal-title" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                    ยืนยันรหัส OTP
                  </h3>
                  {isUbuEmail(email) && (
                    <span className="ubu-inline-pill">
                      <AcademicCapIcon style={{ width: '14px', height: '14px' }} /> รอเปิดใช้งานสิทธิ์ ม.อุบลฯ
                    </span>
                  )}
                </div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  ส่งรหัส 6 หลักไปยัง <strong>{email}</strong> แล้ว
                </p>
              </div>
            </div>

            {/* Dev Test OTP Banner (D-47) */}
            {devOtpCode && (
              <div className="dev-otp-helper-banner" role="status">
                <div className="dev-otp-helper-label">
                  <SparklesIcon style={{ width: '16px', height: '16px' }} />
                  <span>โหมดทดสอบ Local</span>
                </div>
                <div className="dev-otp-code-display">
                  รหัส OTP สำหรับทดสอบ: <strong id="dev-otp-value">{devOtpCode}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const chars = devOtpCode.slice(0, 6).split('');
                    const nextDigits = ['', '', '', '', '', ''];
                    for (let i = 0; i < chars.length; i++) nextDigits[i] = chars[i];
                    setOtpDigits(nextDigits);
                    setOtpCode(devOtpCode);
                    inputRefs.current[5]?.focus();
                  }}
                  className="dev-otp-autofill-btn"
                  id="dev-otp-autofill-btn"
                >
                  คลิกเพื่อกรอกอัตโนมัติ
                </button>
              </div>
            )}

            <div className="otp-input-centered-section">
              <label htmlFor="otp-input" className="otp-input-label">
                รหัส OTP 6 หลัก *
              </label>
              <fieldset className="otp-boxes-group" aria-label="ช่องกรอกรหัส OTP 6 หลัก">
                {OTP_BOX_KEYS.map((boxKey, idx) => (
                  <input
                    key={boxKey}
                    ref={el => {
                      inputRefs.current[idx] = el;
                    }}
                    id={idx === 0 ? 'otp-input' : `otp-input-${idx}`}
                    aria-label={idx === 0 ? 'รหัส OTP 6 หลัก *' : `รหัส OTP หลักที่ ${idx + 1}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    maxLength={6}
                    value={otpDigits[idx] || ''}
                    onFocus={e => e.target.select()}
                    onChange={e => handleDigitChange(idx, e.target.value)}
                    onKeyDown={e => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    className={`otp-digit-box ${otpDigits[idx] ? 'otp-digit-filled' : ''}`}
                  />
                ))}
              </fieldset>
              {expiresInSeconds > 0 && (
                <p className="otp-expiry-countdown">
                  รหัสหมดอายุใน: {Math.floor(expiresInSeconds / 60)}:{(expiresInSeconds % 60).toString().padStart(2, '0')} นาที
                </p>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.5rem 0 1rem', fontSize: '0.85rem' }}>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldownSeconds > 0 || isPending}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '0.85rem',
                  color: cooldownSeconds > 0 ? 'var(--muted)' : 'var(--blue)',
                  cursor: cooldownSeconds > 0 || isPending ? 'not-allowed' : 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {cooldownSeconds > 0 ? `ขอรหัสใหม่ได้ในอีก ${cooldownSeconds} วินาที` : 'ขอรหัส OTP ใหม่'}
              </button>
            </div>

            <div className="otp-modal-actions">
              <button
                type="button"
                id="back-to-details-btn"
                onClick={() => {
                  setStep('details');
                  setIsConfirmModalOpen(false);
                  setOtpCode('');
                  setOtpDigits(['', '', '', '', '', '']);
                  setError(null);
                  if (onStepChange) onStepChange('details');
                  if (onResetVerification) onResetVerification();
                }}
                className="otp-modal-cancel-btn"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                disabled={isPending || otpCode.trim().length !== 6}
                onClick={() => setIsConfirmModalOpen(true)}
                className="otp-modal-cancel-btn"
                id="verify-otp-open-confirm-btn"
              >
                ยืนยันรหัส OTP
              </button>
              <button
                type="button"
                disabled={isPending || otpCode.trim().length !== 6}
                onClick={() => handleExecuteVerifyOtp(true)}
                className="otp-modal-confirm-btn"
                id="confirm-otp-modal-proceed-btn"
              >
                {isPending ? 'กำลังตรวจสอบ...' : 'ยืนยันและไปหน้าชำระเงิน'}
              </button>
            </div>

            {isConfirmModalOpen && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                }}
              >
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                  ยืนยันข้อมูลคำสั่งซื้อและการล็อกสิทธิ์
                </h4>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#475569' }}>
                  กรุณาตรวจสอบข้อมูลผู้ซื้อก่อนยืนยันตัวตน เมื่อยืนยันแล้วจะไม่สามารถแก้ไขจำนวนบัตรได้
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="otp-modal-cancel-btn"
                    onClick={() => setIsConfirmModalOpen(false)}
                    disabled={isPending}
                  >
                    แก้ไขข้อมูล
                  </button>
                  <button
                    type="button"
                    className="otp-modal-confirm-btn"
                    onClick={() => handleExecuteVerifyOtp(false)}
                    disabled={isPending}
                  >
                    {isPending ? 'กำลังตรวจสอบ...' : 'ยืนยันและดำเนินการต่อ'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Verified Status (D-46 Strict One-Way Lock) */}
      {step === 'verified' && verifiedBuyer && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '1.5rem', boxShadow: '0 4px 14px -3px rgba(22, 101, 52, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <CheckCircleIcon style={{ width: '24px', height: '24px', color: '#166534' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#166534' }}>
              ยืนยันอีเมลสำเร็จ (Guest Verified)
            </h3>
          </div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.95rem', color: '#166534' }}>
            ข้อมูลผู้ซื้อได้รับการยืนยันเรียบร้อยแล้ว
          </p>

          <div style={{ background: 'var(--white)', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '1rem', fontSize: '0.9rem', lineHeight: 1.6, marginTop: '1rem' }}>
            <div><strong>ชื่อผู้ซื้อ:</strong> <span id="verified-buyer-name">{verifiedBuyer.name}</span></div>
            <div><strong>อีเมล:</strong> <span id="verified-buyer-email">{verifiedBuyer.email}</span></div>
            <div><strong>เบอร์โทรศัพท์:</strong> <span id="verified-buyer-phone">{verifiedBuyer.phone}</span></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button
              type="button"
              id="reset-buyer-details-btn"
              onClick={() => {
                setStep('details');
                setVerifiedBuyer(null);
                setOtpCode('');
                setOtpDigits(['', '', '', '', '', '']);
                if (onStepChange) onStepChange('details');
                if (onResetVerification) onResetVerification();
              }}
              style={{
                background: 'transparent',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '0.45rem 0.9rem',
                fontSize: '0.85rem',
                color: '#475569',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
            >
              แก้ไขข้อมูลผู้ซื้อ / ใช้อีเมลอื่น
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
