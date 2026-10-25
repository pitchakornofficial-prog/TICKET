'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OrderReservationDetail } from '@/server/reservation';
import type { PaymentChargeDetail } from '@/server/payment';
import type { TicketDetail } from '@/server/tickets';
import { formatBaht } from '@/lib/locale';
import { PurchaseStepIndicator } from './purchase-step-indicator';
import {
  CheckCircleIcon,
  ClockIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
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
          fetch(`/api/public/checkout/orders/${orderId}/payment-qr`)
            .then(qrRes => (qrRes.ok ? qrRes.json() : null))
            .then(qrData => {
              if (qrData?.charge) {
                setCharge(qrData.charge);
              }
            })
            .catch(() => {});
        }
        setIsLoadingOrder(false);
      })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'ไม่พบข้อมูลคำสั่งซื้อ');
        setIsLoadingOrder(false);
      });
  }, [orderId]);

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
    const token =
      typeof window !== 'undefined' ? sessionStorage.getItem('ticket_guest_otp_token') : '';
    if (!token) {
      setPaymentError('ไม่พบเซสชันยืนยันตัวตน OTP กรุณากลับไปทำรายการจากหน้าเลือกบัตร');
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

  return (
    <div className="event-detail-page">
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

      <section
        className={`account-card ${
          isPaid
            ? 'reservation-paid-card'
            : isPaymentException
              ? 'reservation-exception-card'
              : isExpired
                ? 'reservation-expired-card'
                : 'reservation-confirmed-card'
        }`}
        style={{
          marginTop: '1.5rem',
          background: 'var(--white)',
          border: `2px solid ${
            isPaid ? '#16a34a' : isPaymentException ? '#ea580c' : isExpired ? '#dc2626' : '#2563eb'
          }`,
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-floating)',
          padding: '2rem',
        }}
        aria-labelledby="reservation-confirmed-title"
        data-testid="order-payment-card"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.5rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--line)',
          }}
        >
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
            <h1 id="reservation-confirmed-title" style={{ margin: 0, fontSize: '1.4rem' }}>
              หมายเลขคำสั่งซื้อ: <span id="reservation-order-id">{reservation.id}</span>
            </h1>
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
                borderRadius: '10px',
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
          {isPaid && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                padding: '0.6rem 1.2rem',
                borderRadius: '10px',
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
              borderRadius: '12px',
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
                'ระบบได้รับยอดชำระเงินเรียบร้อยแล้ว แต่เนื่องจากคำสั่งซื้อชำระเกินกำหนดเวลา 15 นาที หรือโควตาบัตรไม่เพียงพอในขณะที่ผลชำระเงินมาถึง ระบบจึงไม่ออกบัตรบางส่วน และได้เปิดเคสให้เจ้าหน้าที่ตรวจสอบเพื่อดำเนินการโอนเงินคืนเต็มจำนวน'}
            </p>
            <button
              type="button"
              onClick={handleStartNewOrder}
              className="primary-button"
            >
              เริ่มทำรายการใหม่
            </button>
          </div>
        )}

        {isExpired && (
          <div
            role="alert"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '1.2rem',
              marginBottom: '1.5rem',
              color: '#991b1b',
            }}
          >
            <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '0.3rem' }}>
              คำสั่งซื้อนี้หมดเวลาชำระเงิน 15 นาทีแล้ว (AC-71)
            </strong>
            <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              ระบบได้ทำการคืนโควตาบัตรกลับสู่ระบบเรียบร้อยแล้ว รายการกันบัตรเดิมไม่สามารถต่ออายุได้
              หากต้องการซื้อบัตร กรุณากดปุ่มด้านล่างเพื่อเริ่มทำรายการใหม่
            </p>
            <button
              type="button"
              onClick={handleStartNewOrder}
              className="primary-button"
            >
              กลับไปเลือกบัตรใหม่
            </button>
          </div>
        )}

        {/* Reserved Items Breakdown */}
        {!isPaid && (
          <div style={{ marginBottom: '1.5rem', opacity: isExpired ? 0.7 : 1 }}>
            <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.8rem', fontWeight: 600 }}>
              รายการบัตร{isExpired ? 'ที่เคยกันไว้' : 'ที่กันไว้'}
            </h2>
            <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
                <tbody>
                  {reservation.items.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <strong>{item.ticketTypeName}</strong> x {item.quantity}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right', fontWeight: 600 }}>
                        {formatBaht(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Price Summary */}
        <div style={{ maxWidth: '380px', marginLeft: isPaid ? '0' : 'auto', marginBottom: '1.5rem', opacity: isExpired ? 0.7 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.95rem' }}>
            <span style={{ color: 'var(--muted)' }}>รวมราคาบัตร (Subtotal):</span>
            <strong id="quote-subtotal">{formatBaht(reservation.subtotal)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.95rem' }}>
            <span style={{ color: 'var(--muted)' }}>ค่าบริการ (Customer Fee):</span>
            <strong id="quote-customer-fee">{formatBaht(reservation.customerFee)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem 0 0', borderTop: '2px solid var(--line)', fontSize: '1.2rem' }}>
            <span style={{ fontWeight: 600 }}>ยอดรวมสุทธิ (Total):</span>
            <strong id="quote-total" style={{ color: isPaid ? '#16a34a' : isExpired ? 'var(--muted)' : 'var(--blue)' }}>
              {formatBaht(reservation.total)}
            </strong>
          </div>
        </div>

        {/* Buyer Info */}
        <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '12px', padding: '1rem 1.25rem', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
          <div>
            ข้อมูลผู้สั่งซื้อ: <strong id="buyer-summary-name">{reservation.buyerName}</strong> (
            <span id="buyer-summary-email">{reservation.buyerEmail}</span>) | โทร:{' '}
            <strong id="buyer-summary-phone">{reservation.buyerPhone}</strong>
          </div>
          <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: '#64748b' }}>
            * บัตรทุกใบในคำสั่งซื้อนี้ใช้ข้อมูลผู้ซื้อชุดเดียวกัน ไม่ต้องลงทะเบียนชื่อผู้เข้าชมแยกใบ (AC-11)
          </div>
        </div>

        {/* Issued Tickets Grid when Paid */}
        {isPaid && (
          <div id="issued-tickets-section" style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.2rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 600 }}>
                บัตรคอนเสิร์ตที่ออกแล้ว (<span id="issued-tickets-count">{tickets.length}</span> ใบ)
              </h2>
              <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 500 }}>
                <ShieldCheckIcon style={{ width: '16px', height: '16px', verticalAlign: 'text-bottom' }} /> QR Code แยกสำหรับเข้างานเฉพาะแต่ละใบ (AC-19)
              </span>
            </div>

            {tickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', background: '#f8fafc', borderRadius: '12px' }}>
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
                      border: 'var(--border-card)',
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
                        borderRadius: '999px',
                      }}
                    >
                      พร้อมใช้งาน
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>
                      ใบที่ {idx + 1} จาก {tickets.length}
                    </div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--blue)' }}>
                      {tkt.ticketTypeName}
                    </h3>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}>
                      {formatBaht(tkt.ticketPrice)}
                    </div>

                    <div
                      style={{
                        background: '#f8fafc',
                        padding: '0.8rem',
                        borderRadius: '12px',
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

            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <Link
                href={`/my-tickets?orderId=${reservation.id}`}
                className="primary-button button-link"
              >
                ดูบัตรและจัดการคำสั่งซื้อในหน้า ค้นหาบัตรของฉัน
              </Link>
            </div>
          </div>
        )}

        {/* PromptPay QR Payment Section */}
        {!isExpired && !isPaid && !isPaymentException && reservation?.status !== 'cancelled' && (
          <div
            id="promptpay-payment-section"
            style={{
              padding: '2rem',
              background: '#f8fafc',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-card)',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem', fontWeight: 600 }}>
              ชำระเงินผ่าน PromptPay QR
            </h2>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', color: 'var(--muted)' }}>
              สแกนชำระผ่านแอปพลิเคชันธนาคาร ยอดเงินตรงตามคำสั่งซื้อ
            </p>

            {paymentError && (
              <div
                role="alert"
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
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
                id="generate-payment-qr-btn"
                type="button"
                onClick={handleGeneratePaymentQr}
                disabled={isGeneratingQr}
                className="primary-button"
                style={{
                  minHeight: '48px',
                  padding: '0.75rem 2.2rem',
                  fontWeight: 600,
                  fontSize: '1.05rem',
                }}
              >
                {isGeneratingQr ? 'กำลังสร้าง QR Code...' : 'สร้าง QR Code ชำระเงิน (PromptPay)'}
              </button>
            ) : (
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    background: 'var(--white)',
                    padding: '1.25rem',
                    borderRadius: '16px',
                    border: 'var(--border-card)',
                    boxShadow: 'var(--shadow-floating)',
                    marginBottom: '1.25rem',
                  }}
                >
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
                <div style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                  ยอดชำระ:{' '}
                  <strong id="payment-total-thb" style={{ fontSize: '1.3rem', color: 'var(--blue)' }}>
                    {formatBaht(reservation.total)}
                  </strong>{' '}
                  <span id="payment-currency" style={{ fontWeight: 600, color: 'var(--muted)' }}>
                    THB
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
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
                  className="primary-button"
                  style={{
                    background: '#16a34a',
                    borderColor: '#16a34a',
                    fontWeight: 600,
                    fontSize: '1rem',
                  }}
                >
                  {isVerifyingPayment
                    ? 'กำลังตรวจสอบการชำระเงิน...'
                    : 'ยืนยันการชำระเงินสำเร็จ (ทดสอบ / Test Payment)'}
                </button>

                <p style={{ margin: '0.9rem 0 0', fontSize: '0.85rem', color: '#166534', fontWeight: 500 }}>
                  * กรุณาชำระเงินให้เสร็จสิ้นก่อนเวลานับถอยหลังสิ้นสุด 15 นาที
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
