'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GuestCheckoutEntry, type VerifiedBuyerInfo } from './guest-checkout-entry';
import { PurchaseStepIndicator } from './purchase-step-indicator';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import {
  CheckCircleIcon,
  InfoIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
  CalendarIcon,
  MapPinIcon,
} from './icons';
import { AlertIcon } from './alert-icon';
import { TicketIcon } from './ticket-icon';

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

interface EventCheckoutFlowProps {
  eventId: string;
  eventTitle: string;
  eventLocation: string;
  limitPerOrder: number;
  sessions: SessionInfo[];
}

export function EventCheckoutFlow({
  eventId,
  eventTitle,
  eventLocation,
  limitPerOrder,
  sessions,
}: EventCheckoutFlowProps) {
  const router = useRouter();
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sessions.length > 0 ? sessions[0].id : '',
  );
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState<VerifiedBuyerInfo | null>(null);
  const [queueBadge, setQueueBadge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawQueue = sessionStorage.getItem(`ticket_queue_pass_${eventId}`);
    if (rawQueue) {
      try {
        const parsed = JSON.parse(rawQueue);
        if (parsed?.queueNumber) {
          setQueueBadge(parsed.queueNumber);
        }
      } catch {
        // ignore parse error
      }
    }
  }, [eventId]);

  const selectedSession = sessions.find(s => s.id === selectedSessionId) || sessions[0];
  const ticketTypes = selectedSession?.ticketTypes || [];

  const totalTickets = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const selectedSubtotal = ticketTypes.reduce(
    (sum, tt) => sum + (quantities[tt.id] || 0) * Number(tt.price),
    0,
  );

  function handleQuantityChange(ticketTypeId: string, delta: number, maxQuota: number) {
    setError(null);
    setQuantities(prev => {
      const current = prev[ticketTypeId] || 0;
      const next = current + delta;
      if (next < 0) return prev;
      if (next > maxQuota) {
        setError(`โควตาบัตรประเภทนี้เหลือเพียง ${maxQuota} ใบ`);
        return prev;
      }
      const nextTotal = totalTickets - current + next;
      if (nextTotal > limitPerOrder) {
        setError(`จำกัดการซื้อสูงสุดไม่เกิน ${limitPerOrder} ใบ ต่อหนึ่งคำสั่งซื้อ`);
        return prev;
      }
      return {
        ...prev,
        [ticketTypeId]: next,
      };
    });
  }

  function handleConfirmReservation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (totalTickets <= 0) {
      setError('กรุณาเลือกจำนวนบัตรอย่างน้อย 1 ใบ ในขั้นตอนที่ 1');
      return;
    }

    if (totalTickets > limitPerOrder) {
      setError(`จำกัดการซื้อสูงสุดไม่เกิน ${limitPerOrder} ใบ ต่อหนึ่งคำสั่งซื้อ`);
      return;
    }

    if (!buyer) {
      setError('กรุณากรอกข้อมูลผู้ซื้อและยืนยันรหัส OTP ในขั้นตอนที่ 2 ก่อนกดยืนยันการจองบัตร');
      return;
    }

    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

    startTransition(async () => {
      try {
        const res = await fetch('/api/public/checkout/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verifiedToken: buyer.token,
            eventId,
            sessionId: selectedSession.id,
            items,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'ไม่สามารถกันบัตรได้ กรุณาลองใหม่อีกครั้ง');
        }

        if (typeof window !== 'undefined' && data.reservation?.id) {
          sessionStorage.setItem(`ticket_active_order_${eventId}`, data.reservation.id);
        }

        router.push(`/orders/${data.reservation.id}/payment`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการกันบัตร';
        setError(msg);
      }
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="event-detail-page">
        <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
          <Link href={`/events/${eventId}`} className="back-link">
            <ArrowLeftIcon /> ย้อนกลับไปหน้ารายละเอียดคอนเสิร์ต
          </Link>
        </nav>
        <div className="empty-catalog-card" style={{ marginTop: '2rem' }}>
          <TicketIcon className="empty-icon" />
          <h2>ยังไม่มีรอบการแสดงที่เปิดจำหน่าย</h2>
          <p>ขณะนี้ยังไม่มีรอบการแสดงที่เปิดให้จองบัตรสำหรับงานนี้</p>
          <Link href={`/events/${eventId}`} className="primary-button button-link">
            กลับไปหน้ารายละเอียด
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="event-detail-page">
      <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
        <Link href={`/events/${eventId}`} className="back-link">
          <ArrowLeftIcon /> ย้อนกลับไปหน้ารายละเอียดคอนเสิร์ต
        </Link>
      </nav>

      <PurchaseStepIndicator currentStep="checkout" eventId={eventId} />

      {/* Event Context Banner */}
      <div className="checkout-event-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <span className="status-badge available-badge mini">
              <CheckCircleIcon /> เปิดจำหน่ายบัตร
            </span>
            {queueBadge && (
              <span className="queue-pass-pill" id="checkout-queue-badge">
                คิวที่ {queueBadge} · ผ่านคิวแล้ว
              </span>
            )}
          </div>
          <h1 className="checkout-banner-title">{eventTitle}</h1>
          <p className="checkout-banner-meta">
            <MapPinIcon /> {eventLocation} · จำกัดสูงสุดไม่เกิน {limitPerOrder} ใบ/คำสั่งซื้อ
          </p>
        </div>
      </div>

      <div className="detail-layout" style={{ marginTop: '1.5rem' }}>
        {/* Left Column: Step 1 (Select Tickets) + Step 2 (Guest Info & OTP) */}
        <div className="detail-main-column">
          {/* Card 1: Select Session & Ticket Quantities First */}
          <section
            className="account-card"
            aria-labelledby="ticket-selection-title"
            data-testid="checkout-ticket-selection-card"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className="step-badge-number">1</span>
                <h2 id="ticket-selection-title" style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600 }}>
                  เลือกรอบการแสดงและจำนวนบัตร
                </h2>
              </div>
              <div style={{ fontSize: '0.9rem', color: totalTickets > limitPerOrder ? '#b91c1c' : 'var(--muted)' }}>
                เลือกแล้ว <strong>{totalTickets}</strong> / {limitPerOrder} ใบ
              </div>
            </div>

            {sessions.length > 1 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="session-select" style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                  เลือกรอบการแสดง
                </label>
                <select
                  id="session-select"
                  value={selectedSession.id}
                  onChange={e => {
                    setSelectedSessionId(e.target.value);
                    setQuantities({});
                    setError(null);
                  }}
                  className="text-input"
                  style={{ maxWidth: '480px' }}
                >
                  {sessions.map((s, idx) => (
                    <option key={s.id} value={s.id}>
                      รอบที่ {idx + 1}: {formatDate(new Date(s.startTime))} ({formatTime(new Date(s.startTime))} - {formatTime(new Date(s.endTime))} น.)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sessions.length === 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '0.95rem' }}>
                <CalendarIcon style={{ width: '18px', height: '18px', color: 'var(--blue)' }} />
                <span>
                  <strong>รอบการแสดง:</strong> {formatDate(new Date(selectedSession.startTime))} เวลา {formatTime(new Date(selectedSession.startTime))} – {formatTime(new Date(selectedSession.endTime))} น.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {ticketTypes.map(tt => {
                const qty = quantities[tt.id] || 0;
                const isSoldOut = tt.quota <= 0;

                return (
                  <div
                    key={tt.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      padding: '1.15rem 1.25rem',
                      background: qty > 0 ? '#eff6ff' : 'var(--white)',
                      border: `1.5px solid ${qty > 0 ? 'var(--blue)' : 'var(--line)'}`,
                      borderRadius: '12px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ flex: '1 1 220px' }}>
                      <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--black)' }}>
                        {tt.name}
                      </div>
                      {tt.description && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                          {tt.description}
                        </div>
                      )}
                      <div style={{ fontSize: '0.85rem', color: isSoldOut ? '#b91c1c' : 'var(--muted)', marginTop: '0.3rem' }}>
                        {isSoldOut ? 'บัตรหมด (Sold Out)' : `คงเหลือ ${tt.quota} ใบ`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--blue)', textAlign: 'right' }}>
                        {formatBaht(tt.price)}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          type="button"
                          aria-label={`ลดจำนวน ${tt.name}`}
                          disabled={isSoldOut || qty <= 0 || isPending}
                          onClick={() => handleQuantityChange(tt.id, -1, tt.quota)}
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            border: '1px solid var(--line)',
                            background: 'var(--white)',
                            fontWeight: 600,
                            fontSize: '1.1rem',
                            cursor: isSoldOut || qty <= 0 ? 'not-allowed' : 'pointer',
                            opacity: isSoldOut || qty <= 0 ? 0.4 : 1,
                          }}
                        >
                          -
                        </button>
                        <span
                          id={`qty-${tt.id}`}
                          style={{ minWidth: '30px', textAlign: 'center', fontWeight: 700, fontSize: '1.05rem' }}
                        >
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label={`เพิ่มจำนวน ${tt.name}`}
                          disabled={isSoldOut || qty >= tt.quota || totalTickets >= limitPerOrder || isPending}
                          onClick={() => handleQuantityChange(tt.id, 1, tt.quota)}
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            border: '1px solid var(--blue)',
                            background: 'var(--blue)',
                            color: 'var(--white)',
                            fontWeight: 600,
                            fontSize: '1.1rem',
                            cursor: isSoldOut || qty >= tt.quota || totalTickets >= limitPerOrder ? 'not-allowed' : 'pointer',
                            opacity: isSoldOut || qty >= tt.quota || totalTickets >= limitPerOrder ? 0.4 : 1,
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Card 2: Buyer Info & OTP Verification */}
          <div style={{ marginTop: '2rem' }}>
            <GuestCheckoutEntry
              stepNumber={2}
              onVerified={verifiedInfo => {
                setBuyer(verifiedInfo);
                setError(null);
              }}
            />
          </div>
        </div>

        {/* Right Sticky Column: Order Summary & Submit Reservation */}
        <aside className="detail-sidebar" style={{ display: 'block' }} aria-label="สรุปรายการจองบัตร">
          <div className="sticky-purchase-card">
            <h3>สรุปรายการจองบัตร</h3>
            <p className="sidebar-event-title">{eventTitle}</p>

            <div className="sidebar-meta">
              <div>
                <CalendarIcon />
                <span>{formatDate(new Date(selectedSession.startTime))}</span>
              </div>
              <div>
                <MapPinIcon />
                <span>{eventLocation}</span>
              </div>
            </div>

            {/* Selected Tickets Breakdown */}
            {totalTickets === 0 ? (
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '10px', border: '1px dashed var(--line)', textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                ยังไม่ได้เลือกจำนวนบัตร
              </div>
            ) : (
              <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {ticketTypes
                  .filter(tt => (quantities[tt.id] || 0) > 0)
                  .map(tt => {
                    const q = quantities[tt.id] || 0;
                    return (
                      <div key={tt.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span>
                          {tt.name} <strong>x{q}</strong>
                        </span>
                        <span style={{ fontWeight: 600 }}>{formatBaht(q * Number(tt.price))}</span>
                      </div>
                    );
                  })}
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600 }}>รวมราคาบัตร ({totalTickets} ใบ)</span>
                  <strong style={{ fontSize: '1.3rem', color: 'var(--blue)' }}>
                    {formatBaht(selectedSubtotal)}
                  </strong>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  * ค่าบริการเพิ่มเติม (ถ้ามี) จะคำนวณและแสดงในหน้าชำระเงิน
                </span>
              </div>
            )}

            {/* OTP Verification Status */}
            <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', borderRadius: '10px', background: buyer ? '#f0fdf4' : '#eff6ff', border: `1px solid ${buyer ? '#bbf7d0' : '#bfdbfe'}`, fontSize: '0.85rem', color: buyer ? '#166534' : '#1e40af', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {buyer ? (
                <>
                  <CheckCircleIcon style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                  <span>ยืนยันอีเมล <strong>{buyer.email}</strong> แล้ว</span>
                </>
              ) : (
                <>
                  <InfoIcon style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                  <span>กรุณายืนยันรหัส OTP ของผู้ซื้อในขั้นตอนที่ 2 ก่อนไปหน้าชำระเงิน</span>
                </>
              )}
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.8rem 1rem',
                  borderRadius: '10px',
                  marginBottom: '1rem',
                  fontSize: '0.9rem',
                  background: '#fef2f2',
                  color: '#991b1b',
                  border: '1px solid #fecaca',
                }}
              >
                <AlertIcon />
                <span>{error}</span>
              </div>
            )}

            <button
              id="confirm-reservation-btn"
              type="button"
              onClick={handleConfirmReservation}
              disabled={totalTickets <= 0 || !buyer || isPending}
              className="primary-button"
              style={{
                width: '100%',
                fontWeight: 600,
                fontSize: '1rem',
                opacity: totalTickets <= 0 || !buyer || isPending ? 0.55 : 1,
                cursor: totalTickets <= 0 || !buyer || isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {isPending
                ? 'กำลังล็อกโควตาบัตร...'
                : `ยืนยันการเลือกบัตร (${totalTickets} ใบ) และไปหน้าชำระเงิน`}
            </button>

            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              <ShieldCheckIcon style={{ width: '16px', height: '16px', color: 'var(--blue)' }} />
              <span>กันโควตาบัตรให้คุณเป็นเวลา 15 นาทีทันทีที่กดยืนยัน</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
