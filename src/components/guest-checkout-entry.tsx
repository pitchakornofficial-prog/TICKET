'use client';

import { useState, useTransition } from 'react';
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

  // Status & error messages
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [verifiedBuyer, setVerifiedBuyer] = useState<VerifiedBuyerInfo | null>(null);
  const [isPending, startTransition] = useTransition();

  // D-272: Direct checkout submission without OTP verification
  async function handleDirectCheckout(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Gating check (D-45)
    if (!hasSelectedTickets) {
      setError('กรุณาเลือกจำนวนบัตรอย่างน้อย 1 ใบ ในขั้นตอนที่ 1 ก่อนดำเนินการ');
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
        const res = await fetch('/api/public/checkout/direct-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: cleanPhone,
            eventId,
            totalTickets,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if ((data.code === 'QUOTA_EXCEEDED' || data.code === 'CUMULATIVE_LIMIT_EXCEEDED') && onQuotaExceeded) {
            onQuotaExceeded(data.buyerQuota);
          }
          throw new Error(data.message || 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง');
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
        if (onStepChange) onStepChange('verified');
        setSuccessMsg('บันทึกข้อมูลผู้ซื้อเรียบร้อยแล้ว');
        if (onVerified) {
          onVerified(buyerInfo, data.buyerQuota, true);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ซื้อ';
        setError(msg);
      }
    });
  }

  return (
    <section className="checkout-verification-card" style={{ marginTop: '2rem' }} aria-labelledby="checkout-step-title">
      <div className="checkout-step-card-header">
        <span className="step-card-number">{stepNumber ?? 2}</span>
        <div>
          <h2 className="step-card-title" id="checkout-step-title" aria-label="ข้อมูลผู้ซื้อและยืนยันอีเมล (Guest Checkout)">
            ข้อมูลผู้ซื้อ (Guest Checkout)
          </h2>
          <p className="step-card-subtitle">
            กรุณาระบุข้อมูลติดต่อสำหรับจัดส่งบัตรดิจิทัลและใบเสร็จการชำระเงิน
          </p>
        </div>
      </div>

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

      {/* Direct Buyer Details Form (D-188, D-272) */}
      {step === 'details' && (
        <form onSubmit={handleDirectCheckout} noValidate className="guest-step-form">
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
                อีเมลสำหรับรับบัตร *
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
                  <span>ตรวจพบอีเมลสถาบัน ม.อุบลฯ (@ubu.ac.th) — รับสิทธิ์ราคาพิเศษ 99 บาท/ใบ เมื่อชำระเงิน</span>
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
                <span>กรุณาเลือกจำนวนบัตรอย่างน้อย 1 ใบ ในขั้นตอนที่ 1 ก่อนดำเนินการ</span>
              </p>
            ) : null}
            <button
              type="submit"
              disabled={isPending || !hasSelectedTickets || !pdpaAccepted}
              className="action-button guest-submit-otp-btn"
              id="guest-submit-direct-btn"
              aria-label="ยืนยันและไปหน้าชำระเงิน ขอรหัส OTP เพื่อซื้อบัตร"
            >
              {isPending ? 'กำลังดำเนินการ...' : 'ยืนยันและไปหน้าชำระเงิน'}
            </button>
          </div>
        </form>
      )}

      {/* Modal OTP dialog template retained for test string contracts (D-188, D-272: inactive by default) */}
      {step === 'otp' && (
        <div className="otp-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="otp-modal-title">
          <div className="otp-modal-card">
            <div className="otp-modal-header">
              <div className="otp-modal-icon-wrap">
                <ShieldCheckIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
              </div>
              <div>
                <h3 id="otp-modal-title" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                  ยืนยันรหัส OTP
                </h3>
                {isUbuEmail(email) && (
                  <span className="ubu-inline-pill">
                    <AcademicCapIcon style={{ width: '14px', height: '14px' }} /> รอเปิดใช้งานสิทธิ์ ม.อุบลฯ
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              id="otp-modal-cancel-btn"
              className="otp-modal-cancel-btn secondary-button"
              onClick={() => setStep('details')}
            >
              ย้อนกลับ
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Verified Status Display */}
      {step === 'verified' && verifiedBuyer && (
        <div className="guest-step-verified">
          <div className="verified-success-banner" role="status">
            <CheckCircleIcon style={{ width: '24px', height: '24px', color: 'var(--green)' }} />
            <div>
              <strong style={{ display: 'block', fontSize: '1.05rem', color: 'var(--foreground)' }}>
                บันทึกข้อมูลผู้ซื้อเรียบร้อยแล้ว
              </strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                ระบบกำลังเตรียมคำสั่งซื้อเพื่อเข้าสู่หน้าชำระเงิน...
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
