'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  GuestCheckoutEntry,
  isUbuEmail,
  type VerifiedBuyerInfo,
  type BuyerQuotaInfo,
} from './guest-checkout-entry';
import { PurchaseStepIndicator } from './purchase-step-indicator';
import { PurchaseTermsFaqList } from './purchase-terms-faq-list';
import { CheckoutTimeoutModal } from './checkout-timeout-modal';
import { QuotaLimitAlertModal } from './quota-limit-alert-modal';
import { FloatingBackToTop } from './floating-back-to-top';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import {
  AcademicCapIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  InfoIcon,
  ArrowLeftIcon,
  CalendarIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from './icons';
import { AlertIcon } from './alert-icon';
import { TicketIcon } from './ticket-icon';

export interface TicketTypeInfo {
  id: string;
  name: string;
  price: number;
  quota: number;
  description?: string;
  isStudentPrivilege?: boolean;
  studentPrice?: number | null;
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
  eventPosterUrl?: string | null;
  limitPerOrder: number;
  sessions: SessionInfo[];
  feeSettings?: {
    customerFeeMode?: 'percentage' | 'per_ticket' | 'per_order';
    customerFeeRate?: number;
    ubuPrivilegeMode?: boolean;
    organizerFeePrivilegeRate?: number;
  };
}

const TOTAL_HOLD_SECONDS = 15 * 60; // 15-minute countdown (900 seconds)

export function EventCheckoutFlow({
  eventId,
  eventTitle,
  eventLocation,
  eventPosterUrl: _eventPosterUrl,
  limitPerOrder,
  sessions,
  feeSettings,
}: EventCheckoutFlowProps) {
  const router = useRouter();
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sessions.length > 0 ? sessions[0].id : '',
  );
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState<VerifiedBuyerInfo | null>(null);
  const [buyerQuota, setBuyerQuota] = useState<BuyerQuotaInfo | null>(null);
  const [quotaModalData, setQuotaModalData] = useState<BuyerQuotaInfo | null>(null);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'details' | 'otp' | 'verified'>('details');
  const [queueBadge, setQueueBadge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TOTAL_HOLD_SECONDS);
  const [isTimeoutModalOpen, setIsTimeoutModalOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = `ticket_checkout_deadline_${eventId}`;
    const rawQueue = sessionStorage.getItem(`ticket_queue_pass_${eventId}`);
    let passDeadline: number | null = null;

    if (rawQueue) {
      try {
        const parsedPass = JSON.parse(rawQueue);
        if (parsedPass?.passedAt) {
          const passTime = new Date(parsedPass.passedAt).getTime();
          if (!Number.isNaN(passTime)) {
            passDeadline = passTime + TOTAL_HOLD_SECONDS * 1000;
          }
        }
      } catch {
        // ignore parse error
      }
    }

    const stored = sessionStorage.getItem(storageKey);
    let deadline: number;

    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!Number.isNaN(parsed) && parsed > Date.now()) {
        deadline = parsed;
      } else {
        setTimeLeft(0);
        setIsTimeoutModalOpen(true);
        return;
      }
    } else if (passDeadline && passDeadline > Date.now()) {
      // Initialize deadline from queue pass
      deadline = passDeadline;
      sessionStorage.setItem(storageKey, deadline.toString());
    } else {
      deadline = Date.now() + TOTAL_HOLD_SECONDS * 1000;
      sessionStorage.setItem(storageKey, deadline.toString());
    }

    const updateTimer = () => {
      const curStored = sessionStorage.getItem(storageKey);
      let curDeadline = deadline;
      if (curStored) {
        const parsed = parseInt(curStored, 10);
        if (!Number.isNaN(parsed)) {
          curDeadline = parsed;
        }
      }
      const remaining = Math.max(0, Math.floor((curDeadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setIsTimeoutModalOpen(true);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [eventId]);

  const timerMinutes = Math.floor(timeLeft / 60);
  const timerSeconds = timeLeft % 60;
  const formattedTimer = `${timerMinutes}:${timerSeconds.toString().padStart(2, '0')}`;
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / TOTAL_HOLD_SECONDS) * 100));

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
  const isLocked = buyer !== null || checkoutStep === 'otp' || checkoutStep === 'verified';
  const selectedSubtotal = ticketTypes.reduce(
    (sum, tt) => sum + (quantities[tt.id] || 0) * Number(tt.price),
    0,
  );

  const UBU_DISCOUNT_PERCENT = 15;
  const UBU_MAX_DISCOUNT_TICKETS = 2;
  const hasUbuPrivilege = isUbuEmail(buyer?.email || '');

  // Check if event has UBU privilege mode enabled or is UBU Freshy Fest (D-181)
  const isUbuFreshyEvent =
    Boolean(feeSettings?.ubuPrivilegeMode) ||
    eventTitle?.includes('UBU Freshy') ||
    eventId?.includes('freshy') ||
    eventId === 'event-ubu-freshy-2026';

  let ubuDiscountAmount = 0;
  if (hasUbuPrivilege) {
    for (const tt of ticketTypes) {
      const count = quantities[tt.id] || 0;
      if (count === 0) continue;
      const isStudentTicket = Boolean(tt.isStudentPrivilege) || isUbuFreshyEvent;
      if (isStudentTicket) {
        const studentPrice = tt.studentPrice != null
          ? Number(tt.studentPrice)
          : (Number(tt.price) === 150 ? 99 : Math.round(Number(tt.price) * 0.85));
        let perTicketDiscount = Math.max(0, Number(tt.price) - studentPrice);
        if (Number(tt.price) === 150 && studentPrice === 99) {
          perTicketDiscount = 150 - 99;
        }
        ubuDiscountAmount += perTicketDiscount * count;
      }
    }

    // D-37 general UBU discount fallback if not using per-ticket student privilege
    if (ubuDiscountAmount === 0 && !isUbuFreshyEvent) {
      const selectedPrices: number[] = [];
      for (const tt of ticketTypes) {
        const count = quantities[tt.id] || 0;
        for (let i = 0; i < count; i++) {
          selectedPrices.push(Number(tt.price));
        }
      }
      selectedPrices.sort((a, b) => b - a);
      const discountedTicketCount = Math.min(selectedPrices.length, UBU_MAX_DISCOUNT_TICKETS);
      for (let i = 0; i < discountedTicketCount; i++) {
        ubuDiscountAmount += Math.round(selectedPrices[i] * (UBU_DISCOUNT_PERCENT / 100));
      }
    }
  }

  const finalTicketSubtotal = Math.max(0, selectedSubtotal - ubuDiscountAmount);

  // Customer service fee calculation (using feeSettings when available, 0.06 or 0.05 default)
  const customerFeeMode = feeSettings?.customerFeeMode || 'percentage';
  const customerFeeRate = feeSettings?.customerFeeRate != null
    ? feeSettings.customerFeeRate
    : (isUbuFreshyEvent ? 6 : 5);
  const _SERVICE_FEE_RATE = customerFeeRate / 100 || 0.06;
  const baseTicketSubtotal = hasUbuPrivilege ? finalTicketSubtotal : selectedSubtotal;

  let serviceFee = 0;
  if (customerFeeMode === 'percentage') {
    serviceFee = Math.ceil(baseTicketSubtotal * (customerFeeRate / 100));
  } else if (customerFeeMode === 'per_ticket') {
    serviceFee = Math.round(customerFeeRate * totalTickets);
  } else if (customerFeeMode === 'per_order') {
    serviceFee = Math.round(customerFeeRate);
  }
  const grandTotal = baseTicketSubtotal + serviceFee;

  const effectiveLimit = buyerQuota ? buyerQuota.remainingQuota : limitPerOrder;

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
      if (nextTotal > effectiveLimit) {
        if (buyerQuota && buyerQuota.alreadyPurchased > 0) {
          setQuotaModalData(buyerQuota);
          setIsQuotaModalOpen(true);
          setError(
            `ท่านเคยสั่งซื้อไปแล้ว ${buyerQuota.alreadyPurchased} ใบ สามารถซื้อเพิ่มได้อีกสูงสุด ${buyerQuota.remainingQuota} ใบ (จำกัดสูงสุด ${limitPerOrder} ใบ ต่อหนึ่งท่านในคอนเสิร์ตนี้)`,
          );
        } else {
          setError(`จำกัดการซื้อสูงสุดไม่เกิน ${limitPerOrder} ใบ ต่อหนึ่งคำสั่งซื้อ`);
        }
        return prev;
      }
      return {
        ...prev,
        [ticketTypeId]: next,
      };
    });
  }

  function handleConfirmReservation(e?: React.FormEvent | React.MouseEvent, explicitBuyer?: VerifiedBuyerInfo) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setError(null);

    const activeBuyer = (explicitBuyer && typeof explicitBuyer === 'object' && 'token' in explicitBuyer)
      ? explicitBuyer
      : buyer;

    if (totalTickets <= 0) {
      setError('กรุณาเลือกจำนวนบัตรอย่างน้อย 1 ใบ ในขั้นตอนที่ 1');
      return;
    }

    if (buyerQuota && totalTickets > buyerQuota.remainingQuota) {
      setQuotaModalData(buyerQuota);
      setIsQuotaModalOpen(true);
      setError(
        `ท่านเคยสั่งซื้อไปแล้ว ${buyerQuota.alreadyPurchased} ใบ สามารถซื้อเพิ่มได้อีกสูงสุด ${buyerQuota.remainingQuota} ใบ (จำกัดสูงสุด ${limitPerOrder} ใบ ต่อหนึ่งท่านในคอนเสิร์ตนี้)`,
      );
      return;
    }

    if (totalTickets > limitPerOrder) {
      setError(`จำกัดการซื้อสูงสุดไม่เกิน ${limitPerOrder} ใบ ต่อหนึ่งคำสั่งซื้อ`);
      return;
    }

    if (!activeBuyer) {
      setError('กรุณากรอกข้อมูลผู้ซื้อและยืนยันรหัส OTP ในขั้นตอนที่ 2 ก่อนกดยืนยันการจองบัตร');
      return;
    }

    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

    setIsPending(true);
    void (async () => {
      try {
        const res = await fetch('/api/public/checkout/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verifiedToken: activeBuyer.token,
            eventId,
            sessionId: selectedSession.id,
            items,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'ไม่สามารถกันบัตรได้ กรุณาลองใหม่อีกครั้ง');
        }

        if (typeof window !== 'undefined') {
          if (data.reservation?.id) {
            sessionStorage.setItem(`ticket_active_order_${eventId}`, data.reservation.id);
          }
          sessionStorage.removeItem(`ticket_checkout_deadline_${eventId}`);
        }

        router.push(`/orders/${data.reservation.id}/payment`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการกันบัตร';
        setError(msg);
      } finally {
        setIsPending(false);
      }
    })();
  }

  const handleBackToDetails = () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`ticket_checkout_deadline_${eventId}`);
        sessionStorage.removeItem(`ticket_queue_pass_${eventId}`);
      }
    } catch {
      // ignore storage errors
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="event-detail-page">
        <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
          <Link href={`/events/${eventId}`} replace className="back-link" onClick={handleBackToDetails}>
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
        <Link href={`/events/${eventId}`} replace className="back-link" onClick={handleBackToDetails}>
          <ArrowLeftIcon /> ย้อนกลับไปหน้ารายละเอียดคอนเสิร์ต
        </Link>
      </nav>

      <PurchaseStepIndicator currentStep="checkout" eventId={eventId} />

      {/* Slim Compact Status Bar (D-40, D-41: clean bar without timer box) */}
      <section className="checkout-compact-status-bar" aria-label="สถานะการจองคอนเสิร์ต">
        <div className="checkout-status-left">
          <div className="checkout-status-badges">
            <span className="queue-pass-pill" id="checkout-queue-badge">
              {queueBadge ? `คิวที่ ${queueBadge} · ผ่านคิวแล้ว` : 'ผ่านคิวแล้ว'}
            </span>
            {hasUbuPrivilege && (
              <span className="ubu-active-pill">
                <AcademicCapIcon style={{ width: '15px', height: '15px' }} /> {isUbuFreshyEvent ? 'สิทธิพิเศษ ม.อุบลฯ 99 บาท/ใบ' : 'สิทธิพิเศษ ม.อุบลฯ ใช้งานแล้ว (-15%)'}
              </span>
            )}
          </div>
          <div className="checkout-status-event-info">
            <h1 className="checkout-status-title">{eventTitle}</h1>
            <div className="checkout-status-meta">
              <span className="checkout-status-meta-item">
                <MapPinIcon style={{ width: '14px', height: '14px' }} /> {eventLocation}
              </span>
              <span className="checkout-status-meta-item">
                <CalendarIcon style={{ width: '14px', height: '14px' }} /> {selectedSession ? formatDate(new Date(selectedSession.startTime)) : ''}
              </span>
              <span className="checkout-status-meta-item">
                จำกัดสูงสุด {limitPerOrder} ใบ/คำสั่งซื้อ
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="checkout-centered-container">
        {/* Step 1: Select Session & Ticket Quantities */}
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

          {isLocked && (
            <div className="checkout-locked-notice">
              <ShieldCheckIcon />
              <span>
                {buyer
                  ? 'ล็อกรอบการแสดงและจำนวนบัตรแล้วตามการยืนยันตัวตน (ไม่สามารถแก้ไขได้)'
                  : 'เข้าสู่ขั้นตอนยืนยันตัวตนแล้ว (ล็อกรอบการแสดงและจำนวนบัตรแล้ว ไม่สามารถแก้ไขได้)'}
              </span>
            </div>
          )}

          {sessions.length > 0 && (
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <label htmlFor="session-select" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, fontSize: '0.98rem' }}>
                  <CalendarIcon style={{ width: '18px', height: '18px', color: 'var(--blue)' }} />
                  <span>{sessions.length > 1 ? 'เลือกรอบการแสดงที่ต้องการชม' : 'รอบการแสดง'}</span>
                </label>
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                  * 1 คำสั่งซื้อผูกกับ 1 รอบการแสดง
                </span>
              </div>

              <div
                className={`session-tab-chips-grid ${
                  sessions.length === 1
                    ? 'session-layout-single'
                    : sessions.length === 2
                      ? 'session-layout-pair'
                      : 'session-layout-scroll'
                }`}
              >
                {sessions.map((s, idx) => {
                  const isSelected = s.id === selectedSession.id;
                  const isSingle = sessions.length === 1;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={isLocked}
                      className={`session-tab-chip-card ${isSingle ? 'session-tab-chip-single' : ''} ${isSelected ? 'session-tab-chip-active' : ''}`}
                      onClick={() => {
                        if (isLocked || isSingle) return;
                        setSelectedSessionId(s.id);
                        setQuantities({});
                        setError(null);
                      }}
                      style={{
                        cursor: isLocked ? 'not-allowed' : (isSingle ? 'default' : 'pointer'),
                        opacity: isLocked ? (isSelected ? 1 : 0.6) : 1,
                      }}
                    >
                      <div className="session-tab-chip-top">
                        <span className="session-tab-chip-pill">รอบ {idx + 1}</span>
                        {isSelected && <span className="session-tab-chip-selected">เลือกแล้ว</span>}
                      </div>
                      <div className="session-tab-chip-date">
                        {formatDate(new Date(s.startTime))}
                      </div>
                      <div className="session-tab-chip-time">
                        เวลา {formatTime(new Date(s.startTime))} – {formatTime(new Date(s.endTime))} น.
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Keep accessible companion select */}
              <select
                id="session-select"
                aria-hidden="true"
                tabIndex={-1}
                value={selectedSession.id}
                onChange={e => {
                  setSelectedSessionId(e.target.value);
                  setQuantities({});
                  setError(null);
                }}
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
              >
                {sessions.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    รอบ {idx + 1}: {formatDate(new Date(s.startTime))} ({formatTime(new Date(s.startTime))} - {formatTime(new Date(s.endTime))} น.)
                  </option>
                ))}
              </select>
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
                    <div style={{ textAlign: 'right' }}>
                      {hasUbuPrivilege && (Boolean(tt.isStudentPrivilege) || isUbuFreshyEvent) ? (
                        <>
                          <div style={{ fontSize: '0.8rem', textDecoration: 'line-through', color: 'var(--muted)' }}>
                            {formatBaht(tt.price)}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--blue)' }}>
                            {formatBaht(
                              tt.studentPrice != null
                                ? Number(tt.studentPrice)
                                : (Number(tt.price) === 150 ? 99 : Math.round(Number(tt.price) * (1 - UBU_DISCOUNT_PERCENT / 100)))
                            )}
                          </div>
                          <span className="ubu-ticket-pill">
                            {isUbuFreshyEvent && Number(tt.price) === 150 && tt.studentPrice == null
                              ? 'สิทธิ์ ม.อุบลฯ 99฿'
                              : `สิทธิ์ ม.อุบลฯ ${formatBaht(
                                  tt.studentPrice != null
                                    ? Number(tt.studentPrice)
                                    : (Number(tt.price) === 150 ? 99 : Math.round(Number(tt.price) * (1 - UBU_DISCOUNT_PERCENT / 100)))
                                )}`}
                          </span>
                        </>
                      ) : hasUbuPrivilege ? (
                        <>
                          <div style={{ fontSize: '0.8rem', textDecoration: 'line-through', color: 'var(--muted)' }}>
                            {formatBaht(tt.price)}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--blue)' }}>
                            {formatBaht(Math.round(Number(tt.price) * (1 - UBU_DISCOUNT_PERCENT / 100)))}
                          </div>
                          <span className="ubu-ticket-pill">
                            {`สิทธิ์ ม.อุบลฯ -${UBU_DISCOUNT_PERCENT}%`}
                          </span>
                        </>
                      ) : (
                        <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--blue)' }}>
                          {formatBaht(tt.price)}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        type="button"
                        aria-label={`ลดจำนวน ${tt.name}`}
                        disabled={isSoldOut || qty <= 0 || isPending || isLocked}
                        onClick={() => handleQuantityChange(tt.id, -1, tt.quota)}
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          border: '1px solid var(--line)',
                          background: 'var(--white)',
                          fontWeight: 600,
                          fontSize: '1.1rem',
                          cursor: isSoldOut || qty <= 0 || isLocked ? 'not-allowed' : 'pointer',
                          opacity: isSoldOut || qty <= 0 || isLocked ? 0.4 : 1,
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
                        disabled={isSoldOut || qty >= tt.quota || totalTickets >= effectiveLimit || isPending || isLocked}
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
                          cursor: isSoldOut || qty >= tt.quota || totalTickets >= effectiveLimit || isLocked ? 'not-allowed' : 'pointer',
                          opacity: isSoldOut || qty >= tt.quota || totalTickets >= effectiveLimit || isLocked ? 0.4 : 1,
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

        {/* Step 2: Progressive Buyer Info & OTP Verification */}
        <div style={{ marginTop: '2rem' }}>
          {buyerQuota && buyerQuota.alreadyPurchased > 0 && (
            <button
              type="button"
              className="buyer-cumulative-quota-card"
              onClick={() => {
                setQuotaModalData(buyerQuota);
                setIsQuotaModalOpen(true);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.875rem 1.25rem',
                background: 'rgba(238, 242, 255, 0.95)',
                border: '1px solid #c7d2fe',
                borderRadius: '12px',
                marginBottom: '1.25rem',
                fontSize: '0.92rem',
                color: '#3730a3',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <ShieldCheckIcon style={{ width: '20px', height: '20px', flexShrink: 0, color: '#4f46e5' }} />
                <div>
                  <strong>ตรวจสอบสิทธิ์สะสม:</strong> เคยซื้อแล้ว <strong>{buyerQuota.alreadyPurchased}</strong> ใบ — ซื้อเพิ่มได้อีก <strong>{buyerQuota.remainingQuota}</strong> ใบ (จากเพดาน {buyerQuota.limitPerOrder} ใบ/ท่าน)
                </div>
              </div>
              <span style={{ fontSize: '0.82rem', textDecoration: 'underline', color: '#4338ca', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                ดูรายละเอียด
              </span>
            </button>
          )}

          <GuestCheckoutEntry
            eventId={eventId}
            totalTickets={totalTickets}
            stepNumber={2}
            hasSelectedTickets={totalTickets > 0}
            onStepChange={setCheckoutStep}
            summaryDetails={{
              sessionText: selectedSession
                ? `${formatDate(new Date(selectedSession.startTime))} (${formatTime(new Date(selectedSession.startTime))} – ${formatTime(new Date(selectedSession.endTime))} น.)`
                : undefined,
              ticketsText: ticketTypes
                .filter(tt => (quantities[tt.id] || 0) > 0)
                .map(tt => `${tt.name} (${quantities[tt.id]} ใบ)`)
                .join(', ') || undefined,
            }}
            onQuotaExceeded={quota => {
              setQuotaModalData(quota);
              setIsQuotaModalOpen(true);
              setError(
                quota.remainingQuota <= 0
                  ? `ท่านได้สั่งซื้อบัตรคอนเสิร์ตนี้ครบตามจำนวนจำกัดแล้ว (${quota.alreadyPurchased} / ${quota.limitPerOrder} ใบ สำหรับอีเมลนี้) เพื่อกระจายสิทธิ์ให้แก่ผู้ชมท่านอื่น`
                  : `ท่านเคยสั่งซื้อไปแล้ว ${quota.alreadyPurchased} ใบ สามารถซื้อเพิ่มได้อีกสูงสุด ${quota.remainingQuota} ใบ (จำกัดสูงสุด ${quota.limitPerOrder} ใบ ต่อหนึ่งท่านในคอนเสิร์ตนี้)`,
              );
            }}
            onVerified={(verifiedInfo, quotaInfo, autoProceed) => {
              setBuyer(verifiedInfo);
              if (quotaInfo) {
                setBuyerQuota(quotaInfo);
                if (totalTickets > quotaInfo.remainingQuota) {
                  setQuotaModalData(quotaInfo);
                  setIsQuotaModalOpen(true);
                  setError(
                    `ท่านเลือกบัตร ${totalTickets} ใบ เกินสิทธิ์คงเหลือที่สามารถซื้อได้อีก ${quotaInfo.remainingQuota} ใบ สำหรับคอนเสิร์ตนี้ (ท่านเคยซื้อแล้ว ${quotaInfo.alreadyPurchased} ใบ จากจำกัดสูงสุด ${quotaInfo.limitPerOrder} ใบ)`,
                  );
                  return;
                }
              }
              setError(null);
              if (autoProceed) {
                handleConfirmReservation(undefined, verifiedInfo);
              }
            }}
            onResetVerification={() => {
              setBuyer(null);
              setBuyerQuota(null);
              setQuotaModalData(null);
              setError(null);
              setIsQuotaModalOpen(false);
            }}
          />
        </div>

        {/* Card 3: Purchase Terms & Guidance (D-42: Independent FAQ item cards) */}
        <PurchaseTermsFaqList />

        {/* Global Error Banner if any */}
        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              padding: '1rem 1.25rem',
              borderRadius: '12px',
              marginTop: '1.5rem',
              fontSize: '0.95rem',
              background: '#fef2f2',
              color: '#991b1b',
              border: '1px solid #fecaca',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.08)',
            }}
          >
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar for Order Summary & Action (D-38) */}
      <div className="checkout-sticky-bar-wrapper">
        {/* Collapsible Breakdown Panel */}
        {isBreakdownOpen && (
          <section className="checkout-sticky-breakdown-panel" aria-label="รายละเอียดสรุปรายการจอง">
            <div className="breakdown-panel-inner">
              <div className="breakdown-panel-header">
                <div>
                  <h4 style={{ margin: '0 0 0.2rem', fontSize: '1.1rem', fontWeight: 700 }}>
                    สรุปรายการจองบัตร
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {eventTitle} · {formatDate(new Date(selectedSession.startTime))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBreakdownOpen(false)}
                  className="breakdown-close-btn"
                  aria-label="ปิดสรุปรายการ"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="breakdown-ticket-items">
                {ticketTypes
                  .filter(tt => (quantities[tt.id] || 0) > 0)
                  .map(tt => {
                    const q = quantities[tt.id] || 0;
                    return (
                      <div key={tt.id} className="breakdown-item-row">
                        <span>
                          {tt.name} <strong>x{q}</strong>
                        </span>
                        <span style={{ fontWeight: 600 }}>{formatBaht(q * Number(tt.price))}</span>
                      </div>
                    );
                  })}
                {totalTickets === 0 && (
                  <p className="breakdown-empty-text">ยังไม่ได้เลือกจำนวนบัตร</p>
                )}
              </div>

              {hasUbuPrivilege && ubuDiscountAmount > 0 && (
                <div className="breakdown-discount-row">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AcademicCapIcon style={{ width: '16px', height: '16px', color: 'var(--blue)' }} />
                    <span>{isUbuFreshyEvent ? 'ส่วนลดสิทธิ์ ม.อุบลฯ (เหลือ 99 บาท/ใบ ทุกใบ)' : `ส่วนลดสิทธิ์ ม.อุบลฯ (${UBU_DISCOUNT_PERCENT}% สูงสุด ${UBU_MAX_DISCOUNT_TICKETS} ใบ)`}</span>
                  </span>
                  <span className="discount-value">-{formatBaht(ubuDiscountAmount)}</span>
                </div>
              )}

              {/* D-40: Ticket Subtotal, Service Fee (5%), and Grand Total */}
              <div className="breakdown-subtotal-row">
                <span>รวมราคาบัตร ({totalTickets} ใบ)</span>
                <span>{formatBaht(baseTicketSubtotal)}</span>
              </div>

              <div className="breakdown-fee-row">
                <span>ค่าธรรมเนียมบริการ ({isUbuFreshyEvent ? '6%' : '5%'})</span>
                <span>+{formatBaht(serviceFee)}</span>
              </div>

              <div className="breakdown-total-row">
                <span style={{ fontWeight: 600 }}>ยอดชำระสุทธิ</span>
                <strong className="breakdown-total-price">
                  {formatBaht(grandTotal)}
                </strong>
              </div>

              {/* Status info in breakdown */}
              <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.85rem', borderRadius: '8px', background: buyer ? '#f0fdf4' : '#eff6ff', border: `1px solid ${buyer ? '#bbf7d0' : '#bfdbfe'}`, fontSize: '0.82rem', color: buyer ? '#166534' : '#1e40af', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {buyer ? (
                  <>
                    <CheckCircleIcon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    <span>ยืนยันอีเมล <strong>{buyer.email}</strong> แล้ว</span>
                  </>
                ) : (
                  <>
                    <InfoIcon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    <span>กรุณากรอกข้อมูลผู้ซื้อและยืนยัน OTP ในขั้นตอนที่ 2</span>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Sticky Bar Main Strip */}
        <div className="checkout-sticky-bar">
          {/* Slender 3px Progress Bar on top edge (D-41) */}
          <div className="checkout-sticky-timer-track" aria-hidden="true">
            <div
              className="checkout-sticky-timer-bar"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="checkout-sticky-bar-inner">
            <div className="checkout-sticky-left">
              <div className="checkout-sticky-price-group">
                <div className="checkout-sticky-qty-label">
                  รวมราคาบัตร ({totalTickets} ใบ)
                </div>
                <div className="checkout-sticky-total-price">
                  {formatBaht(grandTotal)}
                </div>
                {serviceFee > 0 && (
                  <div className="checkout-sticky-fee-subnote">
                    (รวมค่าบริการ {isUbuFreshyEvent ? '6%' : '5%'} {formatBaht(serviceFee)})
                  </div>
                )}
              </div>

              <div className="sticky-timer-pill" title="เวลาสำหรับทำรายการจองบัตร">
                <ClockIcon style={{ width: '18px', height: '18px', color: '#0f172a' }} />
                <span className="sticky-timer-digits">{formattedTimer}</span>
              </div>

              <button
                type="button"
                onClick={() => setIsBreakdownOpen(prev => !prev)}
                className="checkout-breakdown-toggle-btn"
                aria-expanded={isBreakdownOpen}
              >
                <span>{isBreakdownOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}</span>
                <ChevronDownIcon
                  style={{
                    width: '14px',
                    height: '14px',
                    transform: isBreakdownOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>
            </div>

            <div className="checkout-sticky-right">
              <button
                id="confirm-reservation-btn"
                type="button"
                aria-label={`ยืนยันการเลือกบัตร (${totalTickets} ใบ)`}
                onClick={() => handleConfirmReservation()}
                disabled={totalTickets <= 0 || !buyer || isPending}
                className="primary-button checkout-sticky-confirm-btn"
              >
                {isPending ? 'กำลังดำเนินการ...' : 'ยืนยันและชำระเงิน'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* D-49: Universal Timeout Warning Modal */}
      <CheckoutTimeoutModal eventId={eventId} isOpen={isTimeoutModalOpen} />

      {/* D-60: Centralized Quota Limit Alert Modal */}
      <QuotaLimitAlertModal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
        onEditBuyer={() => {
          setIsQuotaModalOpen(false);
          setBuyer(null);
          setBuyerQuota(null);
          setQuotaModalData(null);
          setError(null);
          setTimeout(() => {
            const emailInput = document.getElementById('buyer-email') as HTMLInputElement | null;
            if (emailInput) {
              emailInput.focus();
              emailInput.select();
            }
          }, 100);
        }}
        buyerEmail={quotaModalData?.email || buyer?.email}
        alreadyPurchased={quotaModalData?.alreadyPurchased ?? 0}
        limitPerOrder={quotaModalData?.limitPerOrder ?? limitPerOrder}
        remainingQuota={quotaModalData?.remainingQuota ?? 0}
        requestedQuantity={totalTickets}
      />

      {/* Universal Floating Back-to-Top Button (D-172) */}
      <FloatingBackToTop hasStickyBar testId="checkout-back-to-top-btn" />
    </div>
  );
}
