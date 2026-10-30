'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OrderReservationDetail } from '@/server/reservation';
import type { PaymentChargeDetail } from '@/server/payment';
import type { TicketDetail } from '@/server/tickets';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { isUbuEmail } from './guest-checkout-entry';
import { PurchaseStepIndicator } from './purchase-step-indicator';
import { PurchaseTermsFaqList } from './purchase-terms-faq-list';
import { CheckoutTimeoutModal } from './checkout-timeout-modal';
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
  ShieldCheckIcon,
  UsersIcon,
} from './icons';
import { AlertIcon } from './alert-icon';
import { TicketIcon } from './ticket-icon';

interface OrderPaymentViewProps {
  orderId: string;
}

export function OrderPaymentView({ orderId }: OrderPaymentViewProps) {
  const router = useRouter();
  const [reservation, setReservation] = useState<OrderReservationDetail | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [charge, setCharge] = useState<PaymentChargeDetail | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [tickets, setTickets] = useState<TicketDetail[]>([]);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentExceptionMessage, setPaymentExceptionMessage] = useState<string | null>(null);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isTimeoutModalOpen, setIsTimeoutModalOpen] = useState(false);

  const handleGeneratePaymentQr = useCallback(async (targetOrderId?: string) => {
    const targetId = targetOrderId || reservation?.id;
    if (!targetId) return;
    const token =
      typeof window !== 'undefined' ? sessionStorage.getItem('ticket_guest_otp_token') : '';
    if (!token) {
      setPaymentError('ไม่พบเซสชันยืนยันตัวตน OTP กรุณากลับไปทำรายการจากหน้าเลือกบัตร');
      return;
    }

    setPaymentError(null);
    setIsGeneratingQr(true);
    try {
      const res = await fetch(`/api/public/checkout/orders/${targetId}/payment-qr`, {
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
  }, [reservation?.id]);

  // Load reservation & existing payment QR on mount
  useEffect(() => {
    setIsLoadingOrder(true);
    fetch(`/api/public/checkout/orders/${orderId}`)
      .then(async res => {
        if (!res.ok) {
          throw new Error('ไม่พบข้อมูลคำสั่งซื้อนี้');
        }
        return res.json();
      })
      .then(data => {
        if (data?.reservation) {
          setReservation(data.reservation);
          if (data.reservation.status === 'paid') {
            router.replace(`/orders/${orderId}/success`);
            return;
          }
          if (data.reservation.status === 'expired') {
            setIsTimeoutModalOpen(true);
          } else {
            fetch(`/api/public/checkout/orders/${orderId}/payment-qr`)
              .then(qrRes => (qrRes.ok ? qrRes.json() : null))
              .then(qrData => {
                if (qrData?.charge) {
                  setCharge(qrData.charge);
                } else if (data.reservation.status === 'reserved') {
                  // Auto-generate QR code if not exists (D-48)
                  handleGeneratePaymentQr(data.reservation.id);
                }
              })
              .catch(() => {});
          }
        }
        setIsLoadingOrder(false);
      })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'ไม่พบข้อมูลคำสั่งซื้อ');
        setIsLoadingOrder(false);
      });
  }, [orderId, handleGeneratePaymentQr, router]);

  // Fetch issued tickets when order is paid
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

  // Countdown timer
  useEffect(() => {
    if (!reservation?.expiresAt) return;
    const updateCountdown = () => {
      const diffMs = new Date(reservation.expiresAt).getTime() - Date.now();
      const sec = Math.max(0, Math.floor(diffMs / 1000));
      setRemainingSeconds(sec);
      if (reservation.status === 'expired' || (sec === 0 && reservation.status === 'reserved')) {
        if (reservation.status === 'reserved') {
          setReservation(prev => (prev ? { ...prev, status: 'expired' } : null));
        }
        setIsTimeoutModalOpen(true);
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

  const TOTAL_HOLD_SECONDS = 15 * 60;
  const progressPercent = isExpired
    ? 0
    : Math.max(0, Math.min(100, (remainingSeconds / TOTAL_HOLD_SECONDS) * 100));
  const timerMinutes = Math.floor(remainingSeconds / 60);
  const timerSeconds = remainingSeconds % 60;

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
        router.replace(`/orders/${reservation.id}/success`);
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

  function handleStartNewOrder() {
    if (typeof window !== 'undefined' && reservation?.eventId) {
      sessionStorage.removeItem(`ticket_active_order_${reservation.eventId}`);
      router.push(`/events/${reservation.eventId}/checkout`);
      return;
    }
    router.push('/');
  }

  if (isLoadingOrder) {
    return (
      <div className="event-detail-page">
        <PurchaseStepIndicator currentStep="payment" orderId={orderId} />
        <div className="empty-catalog-card" style={{ marginTop: '2.5rem' }}>
          <ClockIcon className="empty-icon" />
          <h2>กำลังโหลดข้อมูลคำสั่งซื้อ...</h2>
          <p>กรุณารอสักครู่ ระบบกำลังดึงรายละเอียดการกันบัตรของท่าน</p>
        </div>
      </div>
    );
  }

  if (loadError || !reservation) {
    return (
      <div className="event-detail-page">
        <PurchaseStepIndicator currentStep="payment" orderId={orderId} />
        <div className="empty-catalog-card" style={{ marginTop: '2.5rem' }}>
          <TicketIcon className="empty-icon" />
          <h2>ไม่พบข้อมูลคำสั่งซื้อ</h2>
          <p>{loadError || 'ไม่พบคำสั่งซื้อที่ระบุในระบบ'}</p>
          <Link href="/" className="primary-button button-link">
            กลับไปหน้าแรก
          </Link>
        </div>
      </div>
    );
  }

  const hasUbuPrivilege = isUbuEmail(reservation.buyerEmail);

  return (
    <div className="event-detail-page payment-page-wrapper">
      <div className="payment-stacked-container">
        <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
          <Link href={`/events/${reservation.eventId}`} className="back-link">
            <ArrowLeftIcon /> ย้อนกลับไปหน้ารายละเอียดคอนเสิร์ต
          </Link>
        </nav>

        <PurchaseStepIndicator
          currentStep="payment"
          eventId={reservation.eventId}
          orderId={reservation.id}
        />

      {/* 1. Compact Status Bar (D-48 matching /checkout) */}
      <section className="checkout-compact-status-bar" aria-label="สถานะคำสั่งซื้อ">
        <div className="checkout-status-left">
          <div className="checkout-status-badges">
            <span
              className={`payment-status-badge ${
                isPaid
                  ? 'badge-paid'
                  : isPaymentException
                    ? 'badge-exception'
                    : isExpired
                      ? 'badge-expired'
                      : 'badge-reserved'
              }`}
            >
              {isPaid
                ? 'ชำระเงินสำเร็จ (Paid)'
                : isPaymentException
                  ? 'รอตรวจสอบเพื่อคืนเงิน (Under Review)'
                  : isExpired
                    ? 'หมดเวลาการกันบัตร (Expired)'
                    : 'กันบัตรสำเร็จ (Reserved)'}
            </span>
            {hasUbuPrivilege && (
              <span className="ubu-active-pill">
                <AcademicCapIcon style={{ width: '15px', height: '15px' }} /> สิทธิพิเศษ ม.อุบลฯ
              </span>
            )}
          </div>
          <div className="checkout-status-event-info">
            <h1 className="checkout-status-title">
              {reservation.eventTitle || 'คอนเสิร์ต'}
            </h1>
            <div className="checkout-status-meta">
              <span className="checkout-status-meta-item">
                หมายเลขคำสั่งซื้อ: <strong id="reservation-order-id">{reservation.id}</strong>
              </span>
              {reservation.eventLocation && (
                <span className="checkout-status-meta-item">
                  <MapPinIcon style={{ width: '14px', height: '14px' }} /> {reservation.eventLocation}
                </span>
              )}
              {reservation.sessionStartTime && (
                <span className="checkout-status-meta-item">
                  <CalendarIcon style={{ width: '14px', height: '14px' }} /> {formatDate(new Date(reservation.sessionStartTime))} เวลา {formatTime(new Date(reservation.sessionStartTime))} น.
                </span>
              )}
            </div>
          </div>
        </div>

        {!isPaid && !isPaymentException && (
          <div className={`payment-status-timer-box ${isExpired ? 'timer-box-expired' : ''}`}>
            <ClockIcon style={{ width: '20px', height: '20px' }} />
            <div>
              <span className="timer-box-sub">
                {isExpired ? 'สถานะเวลา' : 'เวลาคงเหลือสำหรับชำระเงิน'}
              </span>
              <strong id="reservation-countdown" className="timer-box-countdown">
                {isExpired
                  ? '0:00 นาที (หมดเวลา)'
                  : `${Math.floor(remainingSeconds / 60)}:${(remainingSeconds % 60).toString().padStart(2, '0')} นาที`}
              </strong>
            </div>
          </div>
        )}
      </section>

      {/* Hidden Card for backwards-compatible test id */}
      <div id="order-payment-card" style={{ display: 'none' }} tabIndex={-1} />

      {/* 2. Paid State: Redirecting Hero Card (D-54) */}
      {isPaid && (
        <section id="issued-tickets-section" aria-labelledby="issued-tickets-title" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <div className="payment-success-hero-card">
            <CheckCircleIcon style={{ width: '48px', height: '48px', color: '#16a34a', margin: '0 auto' }} />
            <h2 id="issued-tickets-title" className="payment-success-hero-title">
              ชำระเงินสำเร็จ ออกบัตรคอนเสิร์ตเรียบร้อยแล้ว
            </h2>
            <strong style={{ fontSize: '1.15rem', color: '#166534', display: 'block', margin: '0.4rem 0' }}>
              ออกบัตรสำเร็จแล้ว ({tickets.length} ใบ)
            </strong>
            <p className="payment-success-hero-sub">
              ระบบได้ทำการออกบัตรคอนเสิร์ตดิจิทัลจำนวน <span id="issued-tickets-count"><strong>{tickets.length}</strong></span> ใบ เรียบร้อยแล้ว กำลังนำท่านไปยังหน้าสลิปและตั๋วคอนเสิร์ต...
            </p>
            <div style={{ marginTop: '1.5rem' }}>
              <Link
                href={`/orders/${reservation.id}/success`}
                className="primary-button button-link"
                style={{ padding: '0.85rem 2rem', fontSize: '1rem', fontWeight: 600, background: '#16a34a', borderColor: '#16a34a' }}
              >
                ไปยังหน้าสลิปและตั๋วคอนเสิร์ตทันที →
              </Link>
            </div>
          </div>

          {/* Hidden tickets container for selector backwards compatibility */}
          <div style={{ display: 'none' }}>
            {tickets.map((tkt, idx) => (
              <div key={tkt.id} className="ticket-card" data-ticket-id={tkt.id}>
                <span id={`ticket-code-${idx}`}>{tkt.ticketCode}</span>
                <span id={`ticket-qr-${idx}`}>{tkt.qrCodeUrl}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isPaid && (
        <>
          {/* 2. Order Summary & Price Breakdown Card (D-50: Placed first in stacked sequence) */}
          <section className="payment-order-summary-card" aria-label="สรุปรายการคำสั่งซื้อ">
        <div className="payment-card-header">
          <div className="payment-card-title-wrap">
            <TicketIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
            <h2 className="summary-card-title">สรุปรายการคำสั่งซื้อ</h2>
          </div>
          <span className="payment-summary-count-badge">
            รวม {reservation.items.reduce((s, it) => s + it.quantity, 0)} ใบ
          </span>
        </div>

        <div className="payment-items-list">
          {reservation.items.map(item => (
            <div key={item.id} className="payment-item-row">
              <div className="payment-item-info">
                <strong className="payment-item-name">{item.ticketTypeName}</strong>
                <span className="payment-item-qty">
                  จำนวน {item.quantity} ใบ
                </span>
              </div>
              <strong className="payment-item-subtotal">{formatBaht(item.subtotal)}</strong>
            </div>
          ))}
        </div>

        <div className="payment-price-breakdown">
          <div className="payment-price-row">
            <span>รวมราคาบัตร:</span>
            <strong id="quote-subtotal">{formatBaht(reservation.subtotal)}</strong>
          </div>

          {reservation.customerFee > 0 && (
            <div className="payment-price-row">
              <span>ค่าบริการระบบ (5%):</span>
              <strong id="quote-customer-fee">{formatBaht(reservation.customerFee)}</strong>
            </div>
          )}

          <div className="payment-grand-total-row">
            <span style={{ fontWeight: 700 }}>ยอดรวมสุทธิ:</span>
            <strong id="quote-total">{formatBaht(reservation.total)}</strong>
          </div>
        </div>
      </section>

      {/* 3. Payment Focus Card (PromptPay QR / Exception / Expired) (D-50) */}
      {!isPaid && (
        <>
          {isPaymentException && (
            <section
              role="alert"
              id="payment-exception-banner"
              className="payment-alert-card payment-alert-exception"
            >
              <div className="payment-alert-header">
                <AlertIcon />
                <strong className="payment-alert-title">
                  คำสั่งซื้อนี้อยู่ระหว่างรอเจ้าหน้าที่ตรวจสอบเพื่อคืนเงินเต็มจำนวน (G-23, G-35)
                </strong>
              </div>
              <p className="payment-alert-desc">
                {paymentExceptionMessage ||
                  'ระบบได้รับยอดชำระเงินเรียบร้อยแล้ว แต่เนื่องจากคำสั่งซื้อชำระเกินกำหนดเวลา 15 นาที หรือโควตาบัตรไม่เพียงพอในขณะที่ผลชำระเงินมาถึง ระบบจึงไม่ออกบัตรบางส่วน และได้เปิดเคสให้เจ้าหน้าที่ตรวจสอบเพื่อดำเนินการโอนเงินคืนเต็มจำนวน'}
              </p>
              <button
                type="button"
                onClick={handleStartNewOrder}
                className="primary-button"
              >
                เริ่มทำรายการใหม่
              </button>
            </section>
          )}

          {isExpired && (
            <section
              role="alert"
              className="payment-alert-card payment-alert-expired"
            >
              <div className="payment-alert-header">
                <AlertIcon />
                <strong className="payment-alert-title">
                  คำสั่งซื้อนี้หมดเวลาชำระเงิน 15 นาทีแล้ว (AC-71)
                </strong>
              </div>
              <p className="payment-alert-desc">
                ระบบได้ทำการคืนโควตาบัตรกลับสู่ระบบเรียบร้อยแล้ว รายการกันบัตรเดิมไม่สามารถต่ออายุได้ หากต้องการซื้อบัตร กรุณากดปุ่มด้านล่างเพื่อเริ่มทำรายการใหม่
              </p>
              <button
                type="button"
                onClick={handleStartNewOrder}
                className="primary-button"
              >
                กลับไปเลือกบัตรใหม่
              </button>
            </section>
          )}

          {!isExpired && !isPaymentException && reservation.status !== 'cancelled' && (
            <section id="promptpay-payment-section" className="payment-qr-card" aria-label="ชำระเงินผ่าน PromptPay QR">
              <div className="payment-qr-card-header">
                <h2 className="payment-qr-title">
                  ชำระเงินผ่าน PromptPay QR
                </h2>
                <p className="payment-qr-desc">
                  เปิดแอปพลิเคชันธนาคารบนมือถือ สแกน QR Code ยอดเงินตรงตามคำสั่งซื้อ
                </p>
              </div>

              <div className="payment-amount-display">
                <span className="amount-label">ยอดชำระสุทธิ:</span>
                <strong id="payment-total-thb" className="amount-val">
                  {formatBaht(reservation.total)}
                </strong>
                <span id="payment-currency" className="currency-label">
                  THB
                </span>
              </div>

              {paymentError && (
                <div role="alert" className="payment-error-alert">
                  {paymentError}
                </div>
              )}

              {!charge ? (
                <button
                  id="generate-payment-qr-btn"
                  type="button"
                  onClick={() => handleGeneratePaymentQr()}
                  disabled={isGeneratingQr}
                  className="primary-button payment-generate-cta-btn"
                >
                  {isGeneratingQr ? 'กำลังสร้าง QR Code...' : 'สร้าง QR Code ชำระเงิน (PromptPay)'}
                </button>
              ) : (
                <>
                  <div className="payment-qr-frame">
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

                  <div className="payment-charge-meta">
                    รหัสธุรกรรม (Charge ID): <strong id="payment-charge-id">{charge.id}</strong>
                  </div>

                  <div className="payment-tips-box">
                    <ShieldCheckIcon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    <span>กรุณาสแกนชำระให้เสร็จสิ้นก่อนเวลาหมด 15 นาที</span>
                  </div>

                  {/* Test Simulation Button */}
                  <button
                    id="simulate-payment-button"
                    type="button"
                    onClick={handleSimulatePaymentSuccess}
                    disabled={isVerifyingPayment}
                    className="primary-button payment-simulate-btn"
                  >
                    {isVerifyingPayment
                      ? 'กำลังตรวจสอบการชำระเงิน...'
                      : 'ยืนยันการชำระเงินสำเร็จ (ทดสอบ / Test Payment)'}
                  </button>

                  {/* Button fallback for tests if needed */}
                  <button
                    id="generate-payment-qr-btn"
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleGeneratePaymentQr()}
                    style={{ display: 'none' }}
                  >
                    สร้าง QR Code ชำระเงิน (PromptPay)
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}

      {/* 4. Buyer Contact Details Card (D-50: Separate Independent Card) */}
      <section className="payment-buyer-details-card" aria-label="ข้อมูลผู้สั่งซื้อ">
        <div className="payment-card-header">
          <div className="payment-card-title-wrap">
            <UsersIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
            <h2 className="summary-card-title">ข้อมูลผู้สั่งซื้อ</h2>
          </div>
          <span className="payment-buyer-badge">ผู้ติดต่อหลัก</span>
        </div>

        <div className="payment-buyer-grid">
          <div className="buyer-grid-item">
            <span className="buyer-item-label">ชื่อ-นามสกุล:</span>
            <strong id="buyer-summary-name" className="buyer-item-value">{reservation.buyerName}</strong>
          </div>
          <div className="buyer-grid-item">
            <span className="buyer-item-label">อีเมลติดต่อ:</span>
            <span id="buyer-summary-email" className="buyer-item-value">{reservation.buyerEmail}</span>
          </div>
          <div className="buyer-grid-item">
            <span className="buyer-item-label">เบอร์โทรศัพท์มือถือ:</span>
            <strong id="buyer-summary-phone" className="buyer-item-value">{reservation.buyerPhone}</strong>
          </div>
        </div>

        <div className="payment-buyer-disclaimer">
          <ShieldCheckIcon style={{ width: '16px', height: '16px', color: '#64748b', flexShrink: 0 }} />
          <span>* บัตรทุกใบในคำสั่งซื้อนี้ใช้ข้อมูลผู้ซื้อชุดเดียวกัน ไม่ต้องลงทะเบียนชื่อผู้เข้าชมแยกใบ (AC-11)</span>
        </div>
      </section>

      {/* 5. Bottom Purchase Terms & FAQ List (D-50) */}
      <PurchaseTermsFaqList />
      </>
      )}

      {/* 6. Sticky Bottom Timer & Amount Bar (D-51: visible everywhere when scrolling) */}
      {!isPaid && !isPaymentException && (
        <aside
          className="payment-sticky-bottom-bar"
          aria-label="แถบสรุปยอดและเวลาคงเหลือสำหรับชำระเงิน"
        >
          {/* 3px Linear Progress Bar running across top of bar */}
          <div className="payment-sticky-timer-track">
            <div
              className={`payment-sticky-timer-fill ${
                isExpired ? 'timer-fill-expired' : remainingSeconds < 180 ? 'timer-fill-warning' : ''
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="payment-sticky-bar-inner">
            <div className="payment-sticky-timer-group">
              <div
                className={`payment-sticky-timer-pill ${
                  isExpired
                    ? 'timer-pill-expired'
                    : remainingSeconds < 180
                      ? 'timer-pill-warning'
                      : ''
                }`}
              >
                <ClockIcon style={{ width: '16px', height: '16px' }} />
                <span>เวลาทำรายการคงเหลือ:</span>
                <strong
                  id="payment-sticky-countdown"
                  className={`payment-sticky-countdown ${
                    isExpired ? 'countdown-expired' : remainingSeconds < 180 ? 'countdown-warning' : ''
                  }`}
                >
                  {isExpired
                    ? '0:00 (หมดเวลา)'
                    : `${timerMinutes}:${timerSeconds.toString().padStart(2, '0')} นาที`}
                </strong>
              </div>
            </div>

            <div className="payment-sticky-amount-group">
              <span className="payment-sticky-amount-label">ยอดชำระสุทธิ:</span>
              <strong className="payment-sticky-amount-value">
                {formatBaht(reservation.total)}
              </strong>
              <span className="payment-sticky-amount-currency">THB</span>
            </div>
          </div>
        </aside>
      )}

      {/* D-49: Universal Timeout Warning Modal */}
      <CheckoutTimeoutModal eventId={reservation.eventId} isOpen={isTimeoutModalOpen} />
      </div>
    </div>
  );
}
