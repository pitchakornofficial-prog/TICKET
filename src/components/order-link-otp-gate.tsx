'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertIcon } from './alert-icon';
import { RefreshIcon, ShieldCheckIcon } from './icons';

interface OrderLinkOtpGateProps {
  orderId: string;
  linkToken: string;
  onVerified: (verifiedToken: string) => void;
}

const OTP_BOX_KEYS = [0, 1, 2, 3, 4, 5];

export function OrderLinkOtpGate({ orderId, linkToken, onVerified }: OrderLinkOtpGateProps) {
  const [requestId, setRequestId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpCode, setOtpCode] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isRequesting, setIsRequesting] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const initialRequestSentRef = useRef(false);

  const requestOtpFromLink = useCallback(async () => {
    setError(null);
    setInfoMessage(null);
    setIsRequesting(true);

    try {
      const res = await fetch('/api/public/orders/link-otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, linkToken }),
      });
      const data = await res.json();

      if (data.maskedEmail) {
        setMaskedEmail(data.maskedEmail);
      }

      if (!res.ok) {
        if (data.code === 'INVALID_LINK' || data.code === 'NOT_PAID') {
          setLinkInvalid(true);
        }
        if (data.code === 'COOLDOWN' && data.cooldownSeconds) {
          setCooldownSeconds(data.cooldownSeconds);
          setInfoMessage(data.message || `กรุณารอ ${data.cooldownSeconds} วินาทีก่อนขอรหัส OTP ใหม่`);
        } else {
          setError(data.message || 'ไม่สามารถส่งรหัส OTP ได้');
        }
        setIsRequesting(false);
        return;
      }

      setRequestId(data.requestId || '');
      setCooldownSeconds(data.cooldownSeconds || 60);
      setIsRequesting(false);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
      setIsRequesting(false);
    }
  }, [orderId, linkToken]);

  useEffect(() => {
    if (initialRequestSentRef.current) return;
    initialRequestSentRef.current = true;
    requestOtpFromLink();
  }, [requestOtpFromLink]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  function handleDigitChange(idx: number, rawVal: string) {
    const digitsOnly = rawVal.replace(/\D/g, '');

    if (digitsOnly.length > 1) {
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
      } else {
        const nextDigits = [...otpDigits];
        nextDigits[idx] = '';
        setOtpDigits(nextDigits);
        setOtpCode(nextDigits.join(''));
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
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasteData) return;
    const nextDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasteData.length; i++) {
      nextDigits[i] = pasteData[i];
    }
    setOtpDigits(nextDigits);
    setOtpCode(nextDigits.join(''));
    const focusTarget = Math.min(5, pasteData.length < 6 ? pasteData.length : 5);
    inputRefs.current[focusTarget]?.focus();
  }

  async function handleVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanCode = otpCode.trim();
    if (cleanCode.length !== 6) {
      setError('กรุณากรอกรหัส OTP 6 หลัก');
      return;
    }
    if (!requestId) {
      setError('กรุณากดส่งรหัส OTP ใหม่ก่อนยืนยัน');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch('/api/public/orders/link-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          linkToken,
          code: cleanCode,
          requestId,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.token) {
        setError(data.message || 'รหัส OTP ไม่ถูกต้อง');
        setIsVerifying(false);
        return;
      }

      onVerified(data.token);
    } catch {
      setError('เกิดข้อผิดพลาดในการตรวจสอบ OTP กรุณาลองใหม่อีกครั้ง');
      setIsVerifying(false);
    }
  }

  return (
    <div className="event-detail-page payment-page-wrapper">
      <div className="lookup-page-wrapper" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
        <div className="lookup-center-card">
          <div className="lookup-card-top-icon">
            <ShieldCheckIcon style={{ width: '28px', height: '28px' }} />
          </div>

          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.4rem 0' }}>
              ยืนยันรหัส OTP เพื่อเปิดดูบัตร
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#475569', margin: '0 0 0.35rem 0' }}>
              คำสั่งซื้อ <strong>{orderId}</strong>
            </p>
            {maskedEmail ? (
              <p style={{ fontSize: '0.9rem', color: '#475569', margin: '0 0 0.35rem 0' }}>
                ระบบส่งรหัส OTP 6 หลักไปยังอีเมล <strong>{maskedEmail}</strong> โดยไม่ต้องกรอกอีเมลและเบอร์โทรซ้ำ
              </p>
            ) : (
              <p style={{ fontSize: '0.9rem', color: '#475569', margin: '0 0 0.35rem 0' }}>
                {isRequesting
                  ? 'กำลังส่งรหัส OTP ไปยังอีเมลผู้ซื้อ...'
                  : 'กรุณากรอกรหัส OTP 6 หลักจากอีเมลของคุณ'}
              </p>
            )}
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
              รหัสมีอายุการใช้งาน 5 นาที
            </p>
          </div>

          {infoMessage && (
            <div className="lookup-notice-box lookup-notice-info" role="status">
              <div>{infoMessage}</div>
            </div>
          )}

          {error && (
            <div className="lookup-notice-box lookup-notice-error" role="alert">
              <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: '2px' }}>
                <AlertIcon />
              </span>
              <div>{error}</div>
            </div>
          )}

          {!linkInvalid ? (
            <>
              <form onSubmit={handleVerifySubmit}>
                <div style={{ marginBottom: '1.75rem', textAlign: 'center' }}>
                  <label
                    htmlFor="link-otp-code"
                    className="lookup-field-label"
                    style={{ marginBottom: '0.75rem' }}
                  >
                    รหัส OTP 6 หลัก
                  </label>

                  <fieldset
                    className="otp-boxes-group"
                    aria-label="ช่องกรอกรหัส OTP 6 หลัก"
                    style={{ justifyContent: 'center' }}
                  >
                    {OTP_BOX_KEYS.map((boxKey, idx) => (
                      <input
                        key={boxKey}
                        ref={el => {
                          inputRefs.current[idx] = el;
                        }}
                        id={idx === 0 ? 'link-otp-code' : `link-otp-code-${idx}`}
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
                        disabled={isVerifying}
                        className={`otp-digit-box ${otpDigits[idx] ? 'otp-digit-filled' : ''}`}
                      />
                    ))}
                  </fieldset>
                </div>

                <button
                  type="submit"
                  id="verify-link-otp-btn"
                  disabled={isVerifying || isRequesting || otpCode.length !== 6 || !requestId}
                  className="lookup-submit-btn"
                  style={{ marginBottom: '1.25rem' }}
                >
                  <span>{isVerifying ? 'กำลังยืนยัน...' : 'ยืนยันรหัส OTP'}</span>
                </button>
              </form>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <Link
                  href={`/my-tickets?orderId=${encodeURIComponent(orderId)}`}
                  style={{
                    color: '#64748b',
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                  }}
                >
                  ค้นหาด้วยอีเมลและเบอร์โทร
                </Link>

                <button
                  type="button"
                  id="resend-link-otp-btn"
                  onClick={requestOtpFromLink}
                  disabled={cooldownSeconds > 0 || isRequesting || isVerifying}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: cooldownSeconds > 0 ? '#94a3b8' : '#1848ed',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: cooldownSeconds > 0 || isRequesting || isVerifying ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                  }}
                >
                  <RefreshIcon style={{ width: '14px', height: '14px' }} />
                  <span>
                    {isRequesting
                      ? 'กำลังส่งรหัส...'
                      : cooldownSeconds > 0
                        ? `ส่งรหัส OTP ใหม่ (${cooldownSeconds} วินาที)`
                        : 'ส่งรหัส OTP ใหม่'}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
              <Link href={`/my-tickets?orderId=${encodeURIComponent(orderId)}`} className="primary-button button-link">
                ยืนยัน OTP ด้วยอีเมลและเบอร์โทร
              </Link>
              <Link href="/" className="secondary-button button-link" style={{ textDecoration: 'none' }}>
                กลับไปหน้าแรก
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
