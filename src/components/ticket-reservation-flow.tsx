'use client';

import { useState, useEffect, useTransition } from 'react';
import { GuestCheckoutEntry, type VerifiedBuyerInfo } from './guest-checkout-entry';
import type { OrderReservationDetail } from '@/server/reservation';
import type { PaymentChargeDetail } from '@/server/payment';
import type { TicketDetail } from '@/server/tickets';
import { formatBaht } from '@/lib/locale';
import { CheckCircleIcon, ClockIcon, InfoIcon, ShieldCheckIcon } from './icons';
import { AlertIcon } from './alert-icon';

export interface TicketTypeInfo {
  id: string;
  name: string;
  price: number;
  quota: number;
  description?: string;
}

export interface SessionInfo {
  id: string;
  startTime: string | Date;
  endTime: string | Date;
  status: string;
  ticketTypes: TicketTypeInfo[];
}

export function TicketReservationFlow({
  eventId,
  limitPerOrder,
  sessions,
}: {
  eventId: string;
  limitPerOrder: number;
  sessions: SessionInfo[];
}) {
  const [buyer, setBuyer] = useState<VerifiedBuyerInfo | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sessions.length > 0 ? sessions[0].id : '',
  );
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<OrderReservationDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  // Payment QR state (TASK-014, AC-15, AC-26)
  const [charge, setCharge] = useState<PaymentChargeDetail | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Issued tickets state (TASK-015, AC-17, AC-19)
  const [tickets, setTickets] = useState<TicketDetail[]>([]);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentExceptionMessage, setPaymentExceptionMessage] = useState<string | null>(null);

  // Expiration countdown
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Restore active reservation on page load/refresh (AC-70)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedOrderId = sessionStorage.getItem(`ticket_active_order_${eventId}`);
    if (!savedOrderId) return;

    fetch(`/api/public/checkout/orders/${savedOrderId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.reservation) {
          setReservation(data.reservation);
          fetch(`/api/public/checkout/orders/${savedOrderId}/payment-qr`)
            .then(qrRes => (qrRes.ok ? qrRes.json() : null))
            .then(qrData => {
              if (qrData?.charge) {
                setCharge(qrData.charge);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [eventId]);

  // Fetch issued tickets when order is paid (AC-17, AC-19)
  useEffect(() => {
    if (!reservation?.id || reservation.status !== 'paid') return;
    fetch(`/api/public/checkout/orders/${reservation.id}/tickets`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.tickets) {
          setTickets(data.tickets);
        }
      })
      .catch(() => {});
  }, [reservation?.id, reservation?.status]);

  useEffect(() => {
    if (!reservation?.expiresAt) return;
    const updateCountdown = () => {
      const diffMs = new Date(reservation.expiresAt).getTime() - Date.now();
      const sec = Math.max(0, Math.floor(diffMs / 1000));
      setRemainingSeconds(sec);
      if (sec === 0 && reservation.status === 'reserved') {
        setReservation(prev => (prev ? { ...prev, status: 'expired' } : null));
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [reservation?.expiresAt, reservation?.status]);

  const isExpired = reservation
    ? reservation.status === 'expired' || remainingSeconds === 0
    : false;
  const isPaid = reservation?.status === 'paid';
  const isPaymentException = reservation?.status === 'payment_exception';

  async function handleGeneratePaymentQr() {
    if (!reservation) return;
    const token = buyer?.token || (typeof window !== 'undefined' ? sessionStorage.getItem('ticket_guest_otp_token') : '');
    if (!token) {
      setPaymentError('กรุณายืนยันตัวตนผ่าน OTP ก่อนขอรับ QR ชำระเงิน (AC-12)');
      return;
    }

    setPaymentError(null);
    setIsGeneratingQr(true);
    try {
      const res = await fetch(`/api/public/checkout/orders/${reservation.id}/payment-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifiedToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'สร้าง QR ชำระเงินไม่สำเร็จ');
      }
      setCharge(data.charge);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้าง QR';
      setPaymentError(msg);
    } finally {
      setIsGeneratingQr(false);
    }
  }

  async function handleSimulatePaymentSuccess() {
    if (!reservation) return;
    setIsVerifyingPayment(true);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/public/checkout/orders/${reservation.id}/pay-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeId: charge?.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'ประมวลผลการชำระเงินไม่สำเร็จ');
      }
      if (data.status === 'paid') {
        setReservation(prev => (prev ? { ...prev, status: 'paid' } : null));
        if (data.tickets) {
          setTickets(data.tickets);
        }
      } else if (data.status === 'paid_after_deadline' || data.status === 'insufficient_quota') {
        setReservation(prev => (prev ? { ...prev, status: 'payment_exception' } : null));
        setPaymentExceptionMessage(data.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการตรวจสอบการชำระเงิน';
      setPaymentError(msg);
    } finally {
      setIsVerifyingPayment(false);
    }
  }

  function handleResetReservation() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`ticket_active_order_${eventId}`);
    }
    setReservation(null);
    setCharge(null);
    setTickets([]);
    setQuantities({});
    setError(null);
    setPaymentError(null);
    window.location.reload();
  }

  const currentSession = sessions.find(s => s.id === selectedSessionId);
  const ticketTypes = currentSession?.ticketTypes || [];

  const totalTickets = Object.values(quantities).reduce((a, b) => a + (b || 0), 0);

  function handleQuantityChange(ttId: string, delta: number, maxQuota: number) {
    setError(null);
    const current = quantities[ttId] || 0;
    const nextVal = Math.max(0, current + delta);

    if (delta > 0 && nextVal > maxQuota) {
      setError('จำนวนบัตรเกินโควตาที่เปิดจำหน่าย');
      return;
    }

    const nextTotal = totalTickets - current + nextVal;
    if (delta > 0 && nextTotal > limitPerOrder) {
      setError(`จำกัดการซื้อไม่เกิน ${limitPerOrder} ใบ ต่อหนึ่งคำสั่งซื้อ (AC-10)`);
      return;
    }

    setQuantities(prev => ({ ...prev, [ttId]: nextVal }));
  }

  async function handleConfirmReservation() {
    if (!buyer?.token) {
      setError('กรุณายืนยันตัวตนผ่าน OTP ด้านบนก่อนดำเนินการ (AC-12)');
      return;
    }
    if (totalTickets <= 0) {
      setError('กรุณาเลือกจำนวนบัตรอย่างน้อย 1 ใบ');
      return;
    }
    if (totalTickets > limitPerOrder) {
      setError(`จำนวนบัตรรวม (${totalTickets} ใบ) เกินขีดจำกัดต่อคำสั่งซื้อ (${limitPerOrder} ใบ)`);
      return;
    }

    setError(null);
    const items = Object.entries(quantities)
      .filter(([_, q]) => q > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

    startTransition(async () => {
      try {
        const res = await fetch('/api/public/checkout/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verifiedToken: buyer.token,
            eventId,
            sessionId: selectedSessionId,
            items,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'กันบัตรไม่สำเร็จ');
        }

        setReservation(data.reservation);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`ticket_active_order_${eventId}`, data.reservation.id);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการกันบัตร';
        setError(msg);
      }
    });
  }

  return (
    <div className="ticket-reservation-flow" style={{ marginTop: '2.5rem' }}>
      {/* 1. Guest Details & OTP Entry */}
      <GuestCheckoutEntry
        onVerified={verifiedInfo => {
          setBuyer(verifiedInfo);
          setError(null);
        }}
      />

      {/* 2. Ticket Quantity Selection & Reservation Form */}
      {!reservation && (
        <section
          className="account-card"
          style={{
            marginTop: '2rem',
            background: buyer ? 'var(--white)' : '#f8fafc',
            border: `1px solid ${buyer ? 'var(--blue)' : 'var(--line)'}`,
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-floating)',
            padding: '1.8rem',
            opacity: buyer ? 1 : 0.85,
          }}
          aria-labelledby="ticket-selection-title"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldCheckIcon style={{ width: '24px', height: '24px', color: 'var(--blue)' }} />
              <h2 id="ticket-selection-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                เลือกประเภทและจำนวนบัตร
              </h2>
            </div>
            <div style={{ fontSize: '0.9rem', color: totalTickets > limitPerOrder ? '#b91c1c' : 'var(--muted)' }}>
              เลือกแล้ว <strong>{totalTickets}</strong> / {limitPerOrder} ใบ (จำกัดสูงสุด {limitPerOrder} ใบ)
            </div>
          </div>

          {!buyer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.8rem 1rem', marginBottom: '1.5rem', fontSize: '0.9rem', color: '#1e40af' }}>
              <InfoIcon style={{ width: '18px', height: '18px', flexShrink: 0 }} />
              <span>กรุณากรอกข้อมูลและยืนยัน OTP ด้านบนให้สำเร็จก่อนยืนยันการกันบัตร (AC-12)</span>
            </div>
          )}

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

          {/* Session Selector if multiple */}
          {sessions.length > 1 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="session-select" style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem' }}>
                เลือกรอบการแสดง
              </label>
              <select
                id="session-select"
                value={selectedSessionId}
                onChange={e => {
                  setSelectedSessionId(e.target.value);
                  setQuantities({});
                  setError(null);
                }}
                style={{
                  width: '100%',
                  maxWidth: '24rem',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '4px',
                  border: '1px solid var(--line)',
                  font: 'inherit',
                  background: 'var(--white)',
                }}
              >
                {sessions.map((sess, idx) => (
                  <option key={sess.id} value={sess.id}>
                    รอบที่ {idx + 1}: {new Date(sess.startTime).toLocaleString('th-TH')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Ticket Types Table */}
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                  <th style={{ padding: '0.8rem 1rem' }}>ประเภทบัตร</th>
                  <th style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>ราคา / ใบ</th>
                  <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>โควตาคงเหลือ</th>
                  <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {ticketTypes.map(tt => {
                  const qty = quantities[tt.id] || 0;
                  const isAvailable = tt.quota > 0;
                  return (
                    <tr key={tt.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '1rem' }}>
                        <strong style={{ display: 'block', fontSize: '1rem' }}>{tt.name}</strong>
                        {tt.description && <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{tt.description}</span>}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>
                        {formatBaht(tt.price)}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        {isAvailable ? (
                          <span style={{ color: '#166534', fontWeight: 500 }}>{tt.quota} ใบ</span>
                        ) : (
                          <span style={{ color: '#991b1b', fontWeight: 500 }}>บัตรหมด</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            type="button"
                            aria-label={`ลดจำนวน ${tt.name}`}
                            disabled={qty <= 0 || !isAvailable}
                            onClick={() => handleQuantityChange(tt.id, -1, tt.quota)}
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '4px',
                              border: '1px solid var(--line)',
                              background: 'var(--white)',
                              cursor: qty <= 0 ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold',
                              fontSize: '1.1rem',
                            }}
                          >
                            -
                          </button>
                          <span
                            id={`qty-${tt.id}`}
                            style={{ minWidth: '28px', textAlign: 'center', fontWeight: 600 }}
                          >
                            {qty}
                          </span>
                          <button
                            type="button"
                            aria-label={`เพิ่มจำนวน ${tt.name}`}
                            disabled={!isAvailable || totalTickets >= limitPerOrder || qty >= tt.quota}
                            onClick={() => handleQuantityChange(tt.id, 1, tt.quota)}
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '4px',
                              border: '1px solid var(--line)',
                              background: 'var(--white)',
                              cursor: !isAvailable || totalTickets >= limitPerOrder || qty >= tt.quota ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold',
                              fontSize: '1.1rem',
                            }}
                          >
                            +
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
              * ระบบจะทำการกันบัตรไว้ 15 นาทีหลังจากกดปุ่มยืนยัน (AC-13, G-05)
            </p>
            <button
              type="button"
              disabled={isPending || totalTickets <= 0 || !buyer}
              onClick={handleConfirmReservation}
              className="action-button"
              style={{
                minHeight: '48px',
                padding: '0.8rem 2.2rem',
                background: 'var(--blue)',
                color: 'var(--white)',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: isPending || totalTickets <= 0 || !buyer ? 'not-allowed' : 'pointer',
                opacity: totalTickets <= 0 || !buyer ? 0.6 : 1,
              }}
            >
              {isPending ? 'กำลังกันบัตร...' : `ยืนยันการเลือกบัตร (${totalTickets} ใบ)`}
            </button>
          </div>
        </section>
      )}

      {/* 3. Confirmed Reservation Card, Expired Card, or Paid & Issued Tickets (AC-69, AC-13, AC-71, AC-11, AC-17, AC-19) */}
      {reservation && (
        <section
          className={`account-card ${isPaid ? 'reservation-paid-card' : isPaymentException ? 'reservation-exception-card' : isExpired ? 'reservation-expired-card' : 'reservation-confirmed-card'}`}
          style={{
            marginTop: '2rem',
            background: 'var(--white)',
            border: `2px solid ${isPaid ? '#16a34a' : isPaymentException ? '#ea580c' : isExpired ? '#dc2626' : '#2563eb'}`,
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-floating)',
            padding: '2rem',
          }}
          aria-labelledby="reservation-confirmed-title"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--line)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                {isPaid ? (
                  <>
                    <CheckCircleIcon style={{ width: '22px', height: '22px', color: '#16a34a' }} />
                    <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase' }}>
                      ชำระเงินสำเร็จ (Paid)
                    </span>
                  </>
                ) : isPaymentException ? (
                  <>
                    <AlertIcon />
                    <span style={{ color: '#ea580c', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase' }}>
                      รอตรวจสอบเพื่อคืนเงิน (Under Review)
                    </span>
                  </>
                ) : isExpired ? (
                  <>
                    <AlertIcon />
                    <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase' }}>
                      หมดเวลาการกันบัตร (Expired)
                    </span>
                  </>
                ) : (
                  <>
                    <ClockIcon style={{ width: '22px', height: '22px', color: '#2563eb' }} />
                    <span style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase' }}>
                      กันบัตรสำเร็จ (Reserved)
                    </span>
                  </>
                )}
              </div>
              <h2 id="reservation-confirmed-title" style={{ margin: 0, fontSize: '1.35rem' }}>
                หมายเลขคำสั่งซื้อ: <span id="reservation-order-id">{reservation.id}</span>
              </h2>
            </div>

            {/* Countdown or Status Banner */}
            {!isPaid && !isPaymentException && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  background: isExpired ? '#fee2e2' : remainingSeconds > 180 ? '#fef3c7' : '#fee2e2',
                  border: `1px solid ${isExpired ? '#fca5a5' : remainingSeconds > 180 ? '#fde68a' : '#fca5a5'}`,
                  padding: '0.6rem 1.2rem',
                  borderRadius: '6px',
                  color: isExpired ? '#991b1b' : remainingSeconds > 180 ? '#92400e' : '#991b1b',
                }}
              >
                <ClockIcon style={{ width: '20px', height: '20px' }} />
                <div>
                  <span style={{ fontSize: '0.8rem', display: 'block', fontWeight: 500 }}>
                    {isExpired ? 'สถานะเวลาการชำระเงิน' : 'เวลาคงเหลือสำหรับการชำระเงิน'}
                  </span>
                  <strong id="reservation-countdown" style={{ fontSize: '1.15rem', letterSpacing: '0.05em' }}>
                    {isExpired
                      ? '0:00 นาที (หมดเวลา)'
                      : `${Math.floor(remainingSeconds / 60)}:${(remainingSeconds % 60).toString().padStart(2, '0')} นาที`}
                  </strong>
                </div>
              </div>
            )}
            {isPaymentException && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  background: '#fffaf5',
                  border: '1px solid #fed7aa',
                  padding: '0.6rem 1.2rem',
                  borderRadius: '6px',
                  color: '#9a3412',
                }}
              >
                <AlertIcon />
                <div>
                  <span style={{ fontSize: '0.8rem', display: 'block', fontWeight: 500 }}>
                    สถานะการประมวลผล
                  </span>
                  <strong style={{ fontSize: '1rem' }}>เปิดเคสตรวจสอบคืนเงินเต็มจำนวนแล้ว</strong>
                </div>
              </div>
            )}
            {isPaid && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: '0.6rem 1.2rem',
                  borderRadius: '6px',
                  color: '#166534',
                }}
              >
                <CheckCircleIcon style={{ width: '20px', height: '20px' }} />
                <div>
                  <span style={{ fontSize: '0.8rem', display: 'block', fontWeight: 500 }}>
                    สถานะคำสั่งซื้อ
                  </span>
                  <strong style={{ fontSize: '1.05rem' }}>ออกบัตรสำเร็จแล้ว ({tickets.length} ใบ)</strong>
                </div>
              </div>
            )}
          </div>

          {isPaymentException && (
            <div
              role="alert"
              id="payment-exception-banner"
              style={{
                background: '#fffaf5',
                border: '1px solid #fed7aa',
                borderRadius: '6px',
                padding: '1.2rem',
                marginBottom: '1.5rem',
                color: '#9a3412',
              }}
            >
              <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '0.3rem' }}>
                คำสั่งซื้อนี้อยู่ระหว่างรอเจ้าหน้าที่ตรวจสอบเพื่อคืนเงินเต็มจำนวน (G-23, G-35)
              </strong>
              <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {paymentExceptionMessage ||
                  'ระบบได้รับยอดชำระเงินเรียบร้อยแล้ว แต่เนื่องจากคำสั่งซื้อชำระเกินกำหนดเวลา 15 นาที หรือโควตาบัตรไม่เพียงพอในขณะที่ผลชำระเงินมาถึง ระบบจึงไม่ออกบัตรบางส่วน และได้เปิดเคสให้เจ้าหน้าที่ตรวจสอบเพื่อดำเนินการโอนเงินคืนเต็มจำนวน (รวมค่าบริการ) ให้แก่ท่าน'}
              </p>
              <button
                type="button"
                onClick={handleResetReservation}
                className="action-button"
                style={{
                  minHeight: '44px',
                  padding: '0.6rem 1.8rem',
                  background: 'var(--blue)',
                  color: 'var(--white)',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                }}
              >
                เริ่มทำรายการใหม่
              </button>
            </div>
          )}

          {reservation?.status === 'cancelled' && (
            <div
              id="reservation-cancelled-alert"
              role="alert"
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '1.2rem',
                marginBottom: '1.5rem',
                color: '#991b1b',
              }}
            >
              <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '0.3rem' }}>
                รอบการแสดงนี้ถูกยกเลิกแล้ว (AC-35, AC-112)
              </strong>
              <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
                ระบบได้ยุติรายการกันบัตรและปิดการรับชำระเงินเรียบร้อยแล้ว หากชำระเงินไปแล้ว ระบบจะประมวลผลการคืนเงินตามเงื่อนไข
              </p>
              <button
                type="button"
                onClick={handleResetReservation}
                className="action-button"
                style={{
                  minHeight: '44px',
                  padding: '0.6rem 1.8rem',
                  background: 'var(--blue)',
                  color: 'var(--white)',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                }}
              >
                ดูงานคอนเสิร์ตอื่น
              </button>
            </div>
          )}

          {isExpired && (
            <div
              role="alert"
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '1.2rem',
                marginBottom: '1.5rem',
                color: '#991b1b',
              }}
            >
              <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '0.3rem' }}>
                คำสั่งซื้อนี้หมดเวลาชำระเงิน 15 นาทีแล้ว (AC-71)
              </strong>
              <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
                ระบบได้ทำการคืนโควตาบัตรกลับสู่ระบบเรียบร้อยแล้ว รายการกันบัตรเดิมไม่สามารถต่ออายุได้ (G-05, G-34)
                หากต้องการซื้อบัตร กรุณากดปุ่มด้านล่างเพื่อเริ่มทำรายการใหม่
              </p>
              <button
                type="button"
                onClick={handleResetReservation}
                className="action-button"
                style={{
                  minHeight: '44px',
                  padding: '0.6rem 1.8rem',
                  background: 'var(--blue)',
                  color: 'var(--white)',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                }}
              >
                เริ่มทำรายการใหม่
              </button>
            </div>
          )}

          {/* Reserved Items (Show only when not paid) */}
          {!isPaid && (
            <div style={{ marginBottom: '1.5rem', opacity: isExpired ? 0.7 : 1 }}>
              <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.8rem', fontWeight: 600 }}>รายการบัตร{isExpired ? 'ที่เคยกันไว้' : 'ที่กันไว้'}</h3>
              <div style={{ background: '#fafafb', border: '1px solid var(--line)', borderRadius: '6px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
                  <tbody>
                    {reservation.items.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '0.8rem 1.2rem' }}>
                          <strong>{item.ticketTypeName}</strong> x {item.quantity}
                        </td>
                        <td style={{ padding: '0.8rem 1.2rem', textAlign: 'right', fontWeight: 500 }}>
                          {formatBaht(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Price Breakdown (AC-69) */}
          <div style={{ maxWidth: '360px', marginLeft: isPaid ? '0' : 'auto', marginBottom: '1.5rem', opacity: isExpired ? 0.7 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.95rem' }}>
              <span style={{ color: 'var(--muted)' }}>รวมราคาบัตร (Subtotal):</span>
              <strong id="quote-subtotal">{formatBaht(reservation.subtotal)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.95rem' }}>
              <span style={{ color: 'var(--muted)' }}>ค่าบริการ (Customer Fee):</span>
              <strong id="quote-customer-fee">{formatBaht(reservation.customerFee)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem 0 0', borderTop: '2px solid var(--line)', fontSize: '1.15rem' }}>
              <span style={{ fontWeight: 600 }}>ยอดรวมสุทธิ (Total):</span>
              <strong id="quote-total" style={{ color: isPaid ? '#16a34a' : isExpired ? 'var(--muted)' : 'var(--blue)' }}>{formatBaht(reservation.total)}</strong>
            </div>
          </div>

          {/* Buyer info (AC-11: single buyer info, no separate attendee registration) */}
          <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '6px', padding: '1rem', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
            <div>ข้อมูลผู้สั่งซื้อ: <strong id="buyer-summary-name">{reservation.buyerName}</strong> (<span id="buyer-summary-email">{reservation.buyerEmail}</span>) | โทร: <strong id="buyer-summary-phone">{reservation.buyerPhone}</strong></div>
            <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: '#64748b' }}>
              * บัตรทุกใบในคำสั่งซื้อนี้ใช้ข้อมูลผู้ซื้อชุดเดียวกัน ไม่ต้องลงทะเบียนชื่อผู้เข้าชมแยกใบ (AC-11)
            </div>
          </div>

          {/* 4. Issued Tickets Grid when Paid (AC-11, AC-17, AC-19) */}
          {isPaid && (
            <div id="issued-tickets-section" style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.2rem' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 600 }}>
                  บัตรคอนเสิร์ตที่ออกแล้ว (<span id="issued-tickets-count">{tickets.length}</span> ใบ)
                </h3>
                <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 500 }}>
                  QR Code แยกสำหรับเข้างานเฉพาะแต่ละใบ (AC-19)
                </span>
              </div>

              {tickets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', background: '#fafafb', borderRadius: '6px' }}>
                  กำลังโหลดข้อมูลบัตรคอนเสิร์ต...
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '1.5rem',
                  }}
                >
                  {tickets.map((tkt, idx) => (
                    <div
                      key={tkt.id}
                      className="ticket-card"
                      data-ticket-id={tkt.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-card)',
                        padding: '1.5rem',
                        boxShadow: 'var(--shadow-floating)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: '1rem',
                          right: '1rem',
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          color: '#166534',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                        }}
                      >
                        พร้อมใช้งาน
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>
                        ใบที่ {idx + 1} จาก {tickets.length}
                      </div>
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--blue)' }}>
                        {tkt.ticketTypeName}
                      </h4>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}>
                        {formatBaht(tkt.ticketPrice)}
                      </div>

                      {/* Ticket QR SVG */}
                      <div
                        style={{
                          background: '#fafafb',
                          padding: '0.8rem',
                          borderRadius: '6px',
                          border: '1px solid var(--line)',
                          marginBottom: '1rem',
                        }}
                      >
                        {/* biome-ignore lint/performance/noImgElement: Data URL SVG QR representation */}
                        <img
                          id={`ticket-qr-${idx}`}
                          src={tkt.qrCodeUrl}
                          alt={`QR Code ${tkt.ticketCode}`}
                          width={180}
                          height={180}
                          style={{ display: 'block', margin: '0 auto' }}
                        />
                      </div>

                      <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                        รหัสบัตร:{' '}
                        <strong
                          id={`ticket-code-${idx}`}
                          style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                        >
                          {tkt.ticketCode}
                        </strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                        รอบ: {new Date(tkt.sessionStartTime).toLocaleString('th-TH')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '1.2rem', textAlign: 'center' }}>
                <a
                  href={`/my-tickets?orderId=${reservation.id}`}
                  style={{
                    display: 'inline-block',
                    color: '#1848ed',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    textDecoration: 'none',
                  }}
                >
                  ดูบัตรและจัดการคำสั่งซื้อในหน้า ค้นหาบัตรของฉัน &rarr;
                </a>
              </div>
            </div>
          )}

          {/* 5. PromptPay QR Payment Section (AC-15, AC-26, AC-13, AC-70) */}
          {!isExpired && !isPaid && !isPaymentException && reservation?.status !== 'cancelled' && (
            <div
              id="promptpay-payment-section"
              style={{
                padding: '1.5rem',
                background: '#f8fafc',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <h3 style={{ fontSize: '1.15rem', margin: '0 0 0.5rem', fontWeight: 600 }}>
                ชำระเงินผ่าน PromptPay QR (AC-15, AC-26)
              </h3>
              <p style={{ margin: '0 0 1.2rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
                สแกนชำระผ่านแอปพลิเคชันธนาคาร ยอดเงินตรงตามคำสั่งซื้อ
              </p>

              {paymentError && (
                <div
                  role="alert"
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    padding: '0.8rem',
                    color: '#991b1b',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                  }}
                >
                  {paymentError}
                </div>
              )}

              {!charge ? (
                <button
                  type="button"
                  onClick={handleGeneratePaymentQr}
                  disabled={isGeneratingQr}
                  className="action-button"
                  style={{
                    minHeight: '44px',
                    padding: '0.7rem 2rem',
                    background: 'var(--blue)',
                    color: 'var(--white)',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    fontSize: '1rem',
                    cursor: isGeneratingQr ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isGeneratingQr ? 'กำลังสร้าง QR Code...' : 'สร้าง QR Code ชำระเงิน (PromptPay)'}
                </button>
              ) : (
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ background: 'var(--white)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '1rem' }}>
                    {/* biome-ignore lint/performance/noImgElement: Data URL SVG QR representation */}
                    <img
                      id="promptpay-qr-image"
                      src={charge.qrCodeUrl}
                      alt="PromptPay QR Code"
                      width={220}
                      height={220}
                      style={{ display: 'block', margin: '0 auto' }}
                    />
                  </div>
                  <div style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>
                    ยอดชำระ:{' '}
                    <strong id="payment-total-thb" style={{ fontSize: '1.25rem', color: 'var(--blue)' }}>
                      {formatBaht(reservation.total)}
                    </strong>{' '}
                    <span id="payment-currency" style={{ fontWeight: 600, color: 'var(--muted)' }}>
                      THB
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                    รหัสธุรกรรม (Charge ID):{' '}
                    <span id="payment-charge-id" style={{ fontFamily: 'monospace' }}>
                      {charge.id}
                    </span>
                  </div>

                  {/* Test Payment Simulation Button for Local/Dev E2E */}
                  <button
                    id="simulate-payment-button"
                    type="button"
                    onClick={handleSimulatePaymentSuccess}
                    disabled={isVerifyingPayment}
                    className="action-button"
                    style={{
                      minHeight: '44px',
                      padding: '0.6rem 1.8rem',
                      background: '#16a34a',
                      color: 'var(--white)',
                      border: 'none',
                      borderRadius: '4px',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      cursor: isVerifyingPayment ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isVerifyingPayment ? 'กำลังตรวจสอบการชำระเงิน...' : 'ยืนยันการชำระเงินสำเร็จ (ทดสอบ / Test Payment)'}
                  </button>

                  <p style={{ margin: '0.8rem 0 0', fontSize: '0.85rem', color: '#166534', fontWeight: 500 }}>
                    * กรุณาชำระเงินให้เสร็จสิ้นก่อนเวลานับถอยหลังสิ้นสุด (AC-13, AC-70)
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
