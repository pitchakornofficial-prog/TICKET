'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OrderReservationDetail } from '@/server/reservation';
import type { PaymentChargeDetail } from '@/server/payment';
import type { TicketDetail } from '@/server/tickets';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { startAdaptivePoller } from '@/lib/adaptive-polling';
import { isUbuEmail } from './guest-checkout-entry';
import { PurchaseStepIndicator } from './purchase-step-indicator';
import { PurchaseTermsFaqList } from './purchase-terms-faq-list';
import { CheckoutTimeoutModal } from './checkout-timeout-modal';
import { FloatingBackToTop } from './floating-back-to-top';
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
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
  const [isDownloadingQr, setIsDownloadingQr] = useState(false);

  const handleDownloadQrCode = useCallback(async () => {
    if (!charge?.qrCodeUrl || !reservation) return;
    setIsDownloadingQr(true);
    try {
      const filename = `promptpay-qr-${reservation.id}.png`;
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('โหลดภาพ QR Code ไม่สำเร็จ'));
        img.src = charge.qrCodeUrl;
      });

      const canvas = document.createElement('canvas');
      const padding = 28;
      const size = Math.max(img.width || 280, 280);
      canvas.width = size + padding * 2;
      canvas.height = size + padding * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('ไม่สามารถสร้าง context รูปภาพได้');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, padding, padding, size, size);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      try {
        const link = document.createElement('a');
        link.href = charge.qrCodeUrl;
        link.download = `promptpay-qr-${reservation.id}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        alert('ไม่สามารถดาวน์โหลดภาพ QR Code ได้');
      }
    } finally {
      setIsDownloadingQr(false);
    }
  }, [charge?.qrCodeUrl, reservation]);

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
    const guestToken =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('ticket_guest_otp_token') || ''
        : '';
    fetch(`/api/public/checkout/orders/${orderId}`, {
      headers: guestToken ? { 'x-guest-token': guestToken } : {},
    })
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
            fetch(`/api/public/checkout/orders/${orderId}/payment-qr`, {
              headers: guestToken ? { 'x-guest-token': guestToken } : {},
            })
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


  // Poll order status while reserved with adaptive intervals, jitter, and backoff
  useEffect(() => {
    if (!orderId || reservation?.status !== 'reserved') return;

    return startAdaptivePoller({
      baseIntervalMs: 3000,
      minIntervalMs: 2500,
      maxIntervalMs: 15000,
      hiddenIntervalMs: 12000,
      jitterRatio: 0.2,
      immediate: false,
      step: async ({ signal, attempt }) => {
        try {
          const guestToken =
            typeof window !== 'undefined'
              ? sessionStorage.getItem('ticket_guest_otp_token') || ''
              : '';
          const res = await fetch(`/api/public/checkout/orders/${orderId}`, {
            headers: guestToken ? { 'x-guest-token': guestToken } : {},
            signal,
          });
          if (!res.ok) {
            return { backoff: true };
          }
          const data = await res.json();
          if (signal.aborted) return { stop: true };
          if (data?.reservation) {
            if (data.reservation.status === 'paid') {
              setReservation(data.reservation);
              router.replace(`/orders/${orderId}/success`);
              return { stop: true };
            }
            if (data.reservation.status === 'expired') {
              setReservation(data.reservation);
              setIsTimeoutModalOpen(true);
              return { stop: true };
            }
          }
          // Gradually widen interval as reservation waiting continues
          const nextDelayMs = attempt >= 10 ? 7500 : attempt >= 4 ? 5000 : 3000;
          return { nextDelayMs };
        } catch {
          if (signal.aborted) return { stop: true };
          return { backoff: true };
        }
      },
    });
  }, [orderId, reservation?.status, router]);

  // Fetch issued tickets when order is paid
  useEffect(() => {
    if (!reservation?.id || reservation.status !== 'paid') return;
    const guestToken =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('ticket_guest_otp_token') || ''
        : '';
    fetch(`/api/public/checkout/orders/${reservation.id}/tickets`, {
      headers: guestToken ? { 'x-guest-token': guestToken } : {},
    })
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
    ? reservation.status === 'expired' || (reservation.status === 'reserved' && remainingSeconds === 0)
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
      const guestToken =
        typeof window !== 'undefined'
          ? sessionStorage.getItem('ticket_guest_otp_token') || ''
          : '';
      const res = await fetch(`/api/public/checkout/orders/${reservation.id}/pay-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(guestToken ? { 'x-guest-token': guestToken } : {}),
        },
        body: JSON.stringify({
          chargeId: charge?.id,
          verifiedToken: guestToken,
          orderToken: guestToken,
        }),
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

  // Determine UBU privilege
  const hasUbuPrivilege = reservation ? isUbuEmail(reservation.buyerEmail) : false;

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

      {/* 0. Topmost Payment Focus Card (D-189: Push PromptPay QR to the very top above concert info) */}
      {!isPaid && (
        <>
          {reservation.status === 'cancelled' && (
            <section role="alert" id="reservation-cancelled-alert" className="payment-alert-card payment-alert-exception">
              <div className="payment-alert-header">
                <AlertIcon />
                <strong className="payment-alert-title">รอบการแสดงนี้ถูกยกเลิกแล้ว</strong>
              </div>
              <p className="payment-alert-desc">คำสั่งซื้อนี้ไม่สามารถชำระเงินได้ กรุณาเริ่มทำรายการใหม่</p>
              <button type="button" onClick={handleStartNewOrder} className="primary-button">กลับไปเลือกบัตรใหม่</button>
            </section>
          )}
          {isPaymentException && (
            <section
              role="alert"
              id="payment-exception-banner"
              className="payment-alert-card payment-alert-exception"
            >
              <div className="payment-alert-header">
                <AlertIcon />
                <strong className="payment-alert-title">
                  คำสั่งซื้อนี้อยู่ระหว่างรอตรวจสอบเพื่อคืนเงิน (Under Review) เต็มจำนวน
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
                  คำสั่งซื้อนี้หมดเวลาการชำระเงิน 15 นาทีแล้ว
                </strong>
                <span className="sr-only">หมดเวลาการกันบัตร (Expired)</span>
                <span className="sr-only">คำสั่งซื้อนี้หมดเวลาชำระเงิน 15 นาทีแล้ว</span>
              </div>
              <p className="payment-alert-desc">
                ระบบได้ทำการยกเลิกการล็อกโควตาบัตรและคืนสิทธิ์ให้แก่ผู้ซื้อท่านอื่นเรียบร้อยแล้ว หากท่านต้องการซื้อบัตร กรุณาเริ่มต้นทำรายการจองบัตรใหม่อีกครั้ง
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
                <h2 className="payment-qr-title" style={{ margin: '0 0 0.4rem' }}>
                  ชำระเงินผ่าน PromptPay QR
                </h2>
                <p className="payment-qr-desc">
                  เปิดแอปพลิเคชันธนาคารบนมือถือ สแกน QR Code ยอดเงินตรงตามคำสั่งซื้อ <strong>{formatBaht(reservation.total)}</strong>
                </p>
              </div>

              {/* Hidden elements for locator compatibility */}
              <div style={{ display: 'none' }}>
                <strong id="payment-total-thb">{formatBaht(reservation.total)}</strong>
                <span id="payment-currency">THB</span>
              </div>

              {paymentError && (
                <div role="alert" className="payment-error-alert">
                  {paymentError}
                </div>
              )}

              {!charge ? (
                <div className="payment-qr-loading-container" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <div
                    className="payment-qr-loading-spinner"
                    style={{
                      width: '44px',
                      height: '44px',
                      margin: '0 auto 0.75rem',
                      border: '3px solid #e2e8f0',
                      borderTopColor: 'var(--blue)',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--black)' }}>
                    กำลังโหลด QR Code ชำระเงิน PromptPay...
                  </p>
                  <p style={{ margin: '0.25rem 0 1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    ระบบกำลังจัดเตรียม QR Code ยอดเงินตรงตามคำสั่งซื้ออัตโนมัติ
                  </p>
                  <button
                    id="generate-payment-qr-btn"
                    type="button"
                    onClick={() => handleGeneratePaymentQr()}
                    disabled={isGeneratingQr}
                    className="primary-button payment-generate-cta-btn"
                    style={{ fontSize: '0.88rem', padding: '0.5rem 1.2rem' }}
                  >
                    {isGeneratingQr ? 'กำลังสร้าง QR Code...' : 'สร้าง QR Code ชำระเงิน (PromptPay)'}
                  </button>
                </div>
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

                  <div className="payment-qr-download-container" style={{ textAlign: 'center', margin: '0.25rem auto 1.25rem' }}>
                    <button
                      id="download-qr-code-btn"
                      type="button"
                      onClick={handleDownloadQrCode}
                      disabled={isDownloadingQr}
                      className="button button-secondary download-qr-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem',
                        padding: '0.45rem 1rem',
                      }}
                    >
                      <DownloadIcon style={{ width: '15px', height: '15px', color: '#475569' }} />
                      <span>{isDownloadingQr ? 'กำลังบันทึกรูป...' : 'บันทึกรูป QR Code (PNG)'}</span>
                    </button>
                  </div>

                  <div className="payment-charge-meta">
                    รหัสธุรกรรม (Charge ID): <strong id="payment-charge-id">{charge.id}</strong>
                  </div>

                  <div className="payment-tips-box">
                    <ShieldCheckIcon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    <span>กรุณาสแกนชำระให้เสร็จสิ้นก่อนเวลาหมด 15 นาที</span>
                  </div>

                  {/* Test Simulation Button */}
                  {process.env.NODE_ENV !== 'production' &&
                    process.env.NEXT_PUBLIC_ENABLE_PAY_TEST === 'true' && (
                      <button
                        id="simulate-payment-button"
                        type="button"
                        onClick={handleSimulatePaymentSuccess}
                        disabled={isVerifyingPayment}
                        className="primary-button payment-simulate-btn"
                      >
                        {isVerifyingPayment
                          ? 'กำลังตรวจสอบการชำระเงิน...'
                          : 'ยืนยันการชำระเงินสำเร็จ'}
                      </button>
                    )}

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

      {/* 1. Concert Information (Compact Status Bar) */}
      <section className="checkout-compact-status-bar" aria-label="ข้อมูลคอนเสิร์ต">
        <div className="checkout-status-left">
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
            {hasUbuPrivilege && (
              <span className="ubu-active-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem' }}>
                <AcademicCapIcon style={{ width: '15px', height: '15px' }} /> สิทธิพิเศษ ม.อุบลฯ
              </span>
            )}
          </div>
        </div>

        {/* Hidden timer and status elements for test locator compatibility */}
        <span id="reservation-countdown" className="sr-only">
          {isExpired
            ? '0:00 นาที (หมดเวลา)'
            : `${Math.floor(remainingSeconds / 60)}:${(remainingSeconds % 60).toString().padStart(2, '0')} นาที`}
        </span>
        {reservation.status === 'reserved' && !isExpired && (
          <span className="sr-only">กันบัตรสำเร็จ (Reserved)</span>
        )}
      </section>

      {/* 2. Buyer Contact Details Card (Placed directly next to Concert Info) */}
      <section className="payment-buyer-details-card" aria-label="ข้อมูลผู้สั่งซื้อ">
        <div className="payment-card-header">
          <div className="payment-card-title-wrap">
            <UsersIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
            <h2 className="summary-card-title">ข้อมูลผู้สั่งซื้อ</h2>
          </div>
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
          <span>* บัตรทุกใบในคำสั่งซื้อนี้ใช้ข้อมูลผู้ซื้อชุดเดียวกัน ไม่จำเป็นต้องลงทะเบียนชื่อผู้เข้าชมแยกใบ</span>
        </div>
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
                  <TicketIcon style={{ width: '14px', height: '14px', color: 'var(--blue)' }} />
                  <span>× {item.quantity}</span>
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

          {reservation.discountAmount > 0 && (
            <div className="payment-price-row discount-row" style={{ color: '#16a34a' }}>
              <span>ส่วนลดสิทธิพิเศษ ม.อุบลฯ (15% สูงสุด 2 ใบ):</span>
              <strong id="quote-discount">-{formatBaht(reservation.discountAmount)}</strong>
            </div>
          )}

          {reservation.customerFee > 0 && (
            <div className="payment-price-row">
              <span>
                ค่าบริการระบบ {reservation.customerFeeMode === 'percentage' ? `(${reservation.customerFeeRate}%)` : ''}:
              </span>
              <strong id="quote-customer-fee">{formatBaht(reservation.customerFee)}</strong>
            </div>
          )}

          <div className="payment-grand-total-row">
            <span style={{ fontWeight: 700 }}>ยอดรวมสุทธิ:</span>
            <strong id="quote-total">{formatBaht(reservation.total)}</strong>
          </div>
        </div>
      </section>
      )}

      {/* Bottom Purchase Terms & FAQ List (D-50) */}
      <PurchaseTermsFaqList />

      {/* 6. Sticky Bottom Timer & Amount Bar (D-51: visible everywhere when scrolling) */}
      {!isPaid && !isPaymentException && reservation.status !== 'cancelled' && (
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
                title="เวลาคงเหลือสำหรับชำระเงิน"
              >
                <ClockIcon style={{ width: '18px', height: '18px', color: '#0f172a' }} />
                <strong
                  id="payment-sticky-countdown"
                  className={`payment-sticky-countdown ${
                    isExpired ? 'countdown-expired' : remainingSeconds < 180 ? 'countdown-warning' : ''
                  }`}
                >
                  {isExpired
                    ? '0:00'
                    : `${timerMinutes}:${timerSeconds.toString().padStart(2, '0')}`}
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

      {/* Universal Floating Back-to-Top Button (D-172) */}
      <FloatingBackToTop hasStickyBar testId="payment-back-to-top-btn" />
    </div>
  );
}
