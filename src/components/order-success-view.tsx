'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { OrderReservationDetail } from '@/server/reservation';
import type { TicketDetail } from '@/server/tickets';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  MailIcon,
  MapPinIcon,
  ReceiptIcon,
  XIcon,
} from './icons';
import { TicketIcon } from './ticket-icon';
import { downloadTicketAsPng, downloadAllTicketsAsPng, generateTicketDataUrl } from './ticket-canvas-download';

interface OrderSuccessViewProps {
  orderId: string;
}

export function OrderSuccessView({ orderId }: OrderSuccessViewProps) {
  const [reservation, setReservation] = useState<OrderReservationDetail | null>(null);
  const [tickets, setTickets] = useState<TicketDetail[]>([]);
  const [ticketImageUrls, setTicketImageUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'receipt' | 'tickets'>('receipt');
  const [devEmailModalOpen, setDevEmailModalOpen] = useState(false);
  const [capturedEmail, setCapturedEmail] = useState<{
    to: string;
    subject: string;
    html?: string;
    text?: string;
  } | null>(null);
  const [isLoadingDevEmail, setIsLoadingDevEmail] = useState(false);

  const handleOpenDevEmailModal = async () => {
    setDevEmailModalOpen(true);
    setIsLoadingDevEmail(true);
    try {
      const res = await fetch('/api/dev/captured-emails');
      if (res.ok) {
        const data = await res.json();
        const emails: Array<{ to: string; subject: string; html?: string; text?: string }> = data?.emails || [];
        const matched =
          emails.slice().reverse().find(m => m.to === reservation?.buyerEmail || m.subject?.includes(orderId)) ||
          emails[emails.length - 1] ||
          null;
        setCapturedEmail(matched);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingDevEmail(false);
    }
  };

  useEffect(() => {
    // Generate image URLs for tickets to ensure 100% parity between on-screen view and downloaded file (D-165, D-168)
    let active = true;
    if (tickets && tickets.length > 0) {
      for (const tkt of tickets) {
        if (!ticketImageUrls[tkt.id]) {
          generateTicketDataUrl(tkt)
            .then(url => {
              if (active) {
                setTicketImageUrls(prev => ({ ...prev, [tkt.id]: url }));
              }
            })
            .catch(() => {
              // fallback to html render
            });
        }
      }
    }
    return () => {
      active = false;
    };
  }, [tickets, ticketImageUrls]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const qTab = new URLSearchParams(window.location.search).get('tab');
      if (qTab === 'tickets') {
        setActiveTab('tickets');
      }
    }

    setIsLoading(true);
    fetch(`/api/public/checkout/orders/${orderId}`)
      .then(async res => {
        if (!res.ok) throw new Error('ไม่พบข้อมูลคำสั่งซื้อ');
        return res.json();
      })
      .then(data => {
        if (data?.reservation) {
          setReservation(data.reservation);
        }
        return fetch(`/api/public/checkout/orders/${orderId}/tickets`);
      })
      .then(async res => {
        if (res.ok) {
          const tktData = await res.json();
          if (tktData?.tickets) {
            setTickets(tktData.tickets);
          }
        }
        setIsLoading(false);
      })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
        setIsLoading(false);
      });
  }, [orderId]);

  async function handleDownloadSingle(ticket: TicketDetail) {
    setDownloadingId(ticket.id);
    try {
      await downloadTicketAsPng(ticket);
    } catch (err) {
      console.error('Failed to download ticket image:', err);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDownloadAll() {
    if (tickets.length === 0) return;
    setIsDownloadingAll(true);
    try {
      await downloadAllTicketsAsPng(tickets);
    } catch (err) {
      console.error('Failed to download all tickets:', err);
    } finally {
      setIsDownloadingAll(false);
    }
  }

  if (isLoading) {
    return (
      <div className="event-detail-page payment-page-wrapper">
        <div className="payment-stacked-container">
          <div className="empty-catalog-card" style={{ marginTop: '2.5rem' }}>
            <ClockIcon className="empty-icon" />
            <h2>กำลังโหลดข้อมูลคำสั่งซื้อและสลิป...</h2>
            <p>กรุณารอสักครู่ ระบบกำลังจัดเตรียมข้อมูลยืนยันการชำระเงินและบัตรดิจิทัล</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !reservation) {
    return (
      <div className="event-detail-page payment-page-wrapper">
        <div className="payment-stacked-container">
          <div className="empty-catalog-card" style={{ marginTop: '2.5rem' }}>
            <TicketIcon className="empty-icon" />
            <h2>ไม่พบข้อมูลคำสั่งซื้อ</h2>
            <p>{loadError || 'ไม่พบคำสั่งซื้อที่ระบุในระบบ'}</p>
            <Link href="/" className="primary-button button-link">
              กลับไปหน้าแรก
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="event-detail-page payment-page-wrapper">
      <div className="payment-stacked-container">
        {/* Top Back Navigation */}
        <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
          <Link href={`/events/${reservation.eventId}`} className="back-link">
            <ArrowLeftIcon /> ย้อนกลับไปหน้ารายละเอียดคอนเสิร์ต
          </Link>
        </nav>

        {/* 1. Compact Status Bar (D-48 & D-53) */}
        <section className="checkout-compact-status-bar" aria-label="สถานะคำสั่งซื้อ">
          <div className="checkout-status-left">
            <div className="checkout-status-badges">
              <span className="payment-status-badge badge-paid">
                ชำระเงินสำเร็จ (Paid)
              </span>
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
        </section>

        {/* 2. Clean Split Tabs Switcher (D-53) */}
        <nav className="success-tabs-nav" aria-label="ตัวเลือกมุมมอง">
          <div className="success-tabs-pill-wrap" role="tablist">
            <button
              type="button"
              id="tab-btn-receipt"
              role="tab"
              aria-selected={activeTab === 'receipt'}
              aria-controls="panel-receipt"
              className={`success-tab-pill ${activeTab === 'receipt' ? 'tab-pill-active' : ''}`}
              onClick={() => setActiveTab('receipt')}
            >
              <ReceiptIcon style={{ width: '18px', height: '18px' }} />
              <span>สลิปการชำระเงิน</span>
            </button>
            <button
              type="button"
              id="tab-btn-tickets"
              role="tab"
              aria-selected={activeTab === 'tickets'}
              aria-controls="panel-tickets"
              className={`success-tab-pill ${activeTab === 'tickets' ? 'tab-pill-active' : ''}`}
              onClick={() => setActiveTab('tickets')}
            >
              <TicketIcon style={{ width: '18px', height: '18px' }} />
              <span>ตั๋วคอนเสิร์ต</span>
              <span className="success-tab-count-badge">{tickets.length} ใบ</span>
            </button>
          </div>
        </nav>

        {/* Main Content Area */}
        <div id="issued-tickets-section">
          {/* TAB 1: Modern Digital Receipt Slip (D-53) */}
          <div
            id="panel-receipt"
            role="tabpanel"
            aria-labelledby="tab-btn-receipt"
            className="success-tab-panel"
            style={{ display: activeTab === 'receipt' ? 'block' : 'none' }}
          >
            <div className="receipt-slip-container">
              <div className="payment-receipt-slip-card">
                {/* Slip Header */}
                <div className="slip-header">
                  <div className="slip-success-icon-badge">
                    <CheckCircleIcon style={{ width: '36px', height: '36px', color: '#16a34a' }} />
                  </div>
                  <h2 id="issued-tickets-title" className="slip-main-title">
                    ชำระเงินสำเร็จเรียบร้อย
                  </h2>
                  <div className="slip-sub-title">
                    ออกบัตรสำเร็จแล้ว ({tickets.length} ใบ)
                  </div>
                </div>

                {/* Amount Box */}
                <div className="slip-amount-box">
                  <span className="slip-amount-label">ยอดชำระเงินสุทธิ</span>
                  <div className="slip-amount-val" id="quote-total">
                    {formatBaht(reservation.total)}
                  </div>
                  <div className="slip-method-badge">
                    <span>ช่องทาง: พร้อมเพย์ (PromptPay QR)</span>
                  </div>
                </div>

                {/* Perforated Divider */}
                <div className="slip-perforated-divider" aria-hidden="true">
                  <div className="slip-notch-left" />
                  <div className="slip-dash-line" />
                  <div className="slip-notch-right" />
                </div>

                {/* Slip Details Table */}
                <div className="slip-details-grid">
                  <div className="slip-row">
                    <span className="slip-label">วันที่และเวลาชำระเงิน:</span>
                    <strong className="slip-value">
                      {new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} น.
                    </strong>
                  </div>

                  <div className="slip-row">
                    <span className="slip-label">รหัสอ้างอิงคำสั่งซื้อ:</span>
                    <strong className="slip-value stub-monospace">{reservation.id}</strong>
                  </div>

                  <div className="slip-row">
                    <span className="slip-label">งานคอนเสิร์ต:</span>
                    <strong className="slip-value">{reservation.eventTitle}</strong>
                  </div>

                  {reservation.sessionStartTime && (
                    <div className="slip-row">
                      <span className="slip-label">รอบการแสดง:</span>
                      <strong className="slip-value">
                        {formatDate(new Date(reservation.sessionStartTime))} เวลา {formatTime(new Date(reservation.sessionStartTime))} น.
                      </strong>
                    </div>
                  )}

                  {reservation.eventLocation && (
                    <div className="slip-row">
                      <span className="slip-label">สถานที่จัดงาน:</span>
                      <strong className="slip-value">{reservation.eventLocation}</strong>
                    </div>
                  )}

                  <div className="slip-row">
                    <span className="slip-label">รายการบัตร:</span>
                    <div className="slip-value slip-items-col">
                      {reservation.items.map(it => (
                        <div key={it.id} className="slip-item-entry">
                          <span>{it.ticketTypeName} × {it.quantity} ใบ</span>
                          <span className="slip-item-sub">{formatBaht(it.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {reservation.discountAmount != null && reservation.discountAmount > 0 && (
                    <div className="slip-row" style={{ color: '#16a34a' }}>
                      <span className="slip-label">ส่วนลดสิทธิพิเศษ ม.อุบลฯ (15%):</span>
                      <strong className="slip-value" style={{ color: '#16a34a' }}>
                        -{formatBaht(reservation.discountAmount)}
                      </strong>
                    </div>
                  )}

                  {reservation.customerFee > 0 && (
                    <div className="slip-row">
                      <span className="slip-label">
                        ค่าบริการระบบ {reservation.customerFeeMode === 'percentage' ? `(${reservation.customerFeeRate}%)` : ''}:
                      </span>
                      <strong className="slip-value">{formatBaht(reservation.customerFee)}</strong>
                    </div>
                  )}

                  <div className="slip-row">
                    <span className="slip-label">ผู้สั่งซื้อ:</span>
                    <strong id="buyer-summary-name" className="slip-value">{reservation.buyerName}</strong>
                  </div>

                  <div className="slip-row">
                    <span className="slip-label">อีเมลติดต่อ:</span>
                    <span id="buyer-summary-email" className="slip-value">{reservation.buyerEmail}</span>
                  </div>

                  <div className="slip-row">
                    <span className="slip-label">เบอร์โทรศัพท์:</span>
                    <strong id="buyer-summary-phone" className="slip-value">{reservation.buyerPhone}</strong>
                  </div>
                </div>

                {/* Slip Bottom CTA Button */}
                <div className="slip-action-footer">
                  <button
                    type="button"
                    id="slip-view-tickets-cta"
                    onClick={() => setActiveTab('tickets')}
                    className="primary-button slip-primary-btn"
                  >
                    <TicketIcon style={{ width: '18px', height: '18px' }} />
                    <span>เปิดดูตั๋วเข้างาน ({tickets.length} ใบ) →</span>
                  </button>
                  <p className="slip-email-note">
                    * ระบบได้ส่งอีเมลยืนยันคำสั่งซื้อไปยัง <strong>{reservation.buyerEmail}</strong> เรียบร้อยแล้ว (AC-19)
                  </p>

                  <div className="dev-mail-preview-wrap" style={{ marginTop: '0.85rem' }}>
                    <button
                      id="dev-mail-preview-btn"
                      type="button"
                      onClick={handleOpenDevEmailModal}
                      className="button button-secondary dev-mail-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        padding: '0.45rem 0.9rem',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: '1px dashed #94a3b8',
                        background: '#f8fafc',
                        color: '#0f172a',
                      }}
                    >
                      <MailIcon style={{ width: '15px', height: '15px' }} />
                      <span>เปิดดูอีเมลตั๋วที่ระบบส่งออก (Dev Preview)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* TAB 2: Dedicated Concert Tickets View (D-53) */}
          <div
            id="panel-tickets"
            role="tabpanel"
            aria-labelledby="tab-btn-tickets"
            className="success-tab-panel"
            style={{ display: activeTab === 'tickets' ? 'block' : 'none' }}
          >
            <div className="tickets-tab-container">
              {/* Tickets Header Bar */}
              <div className="tickets-view-header">
                <div className="tickets-view-heading-wrap">
                  <h2 className="tickets-view-title">
                    คุณมีบัตรคอนเสิร์ตทั้งหมด <span id="issued-tickets-count">{tickets.length}</span> ใบ
                  </h2>
                  <p className="tickets-view-desc">
                    โปรดแสดง QR Code แต่ละใบต่อเจ้าหน้าที่เพื่อสแกนเข้าชมงาน หรือบันทึกรูปภาพเก็บไว้ในสมาร์ตโฟน
                  </p>
                </div>

                {tickets.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDownloadAll}
                    disabled={isDownloadingAll}
                    className="primary-button success-download-all-btn"
                  >
                    <DownloadIcon style={{ width: '18px', height: '18px' }} />
                    <span>{isDownloadingAll ? 'กำลังบันทึกรูป...' : `บันทึกรูปบัตรทั้งหมดลงเครื่อง (${tickets.length} ใบ)`}</span>
                  </button>
                )}
              </div>

              {/* Classic Ticket Stubs List (2.5:1 ratio, 1200 x 500 px standard) */}
              <div className="ticket-stubs-container">
                {tickets.map((tkt, idx) => (
                  <div key={tkt.id} className="ticket-stub-wrapper">
                    <div
                      className="ticket-card digital-ticket-pass classic-ticket-stub"
                      data-ticket-id={tkt.id}
                      style={
                        ticketImageUrls[tkt.id]
                          ? { padding: 0, border: 'none', background: 'transparent', boxShadow: 'none' }
                          : undefined
                      }
                    >
                      {ticketImageUrls[tkt.id] ? (
                        // biome-ignore lint/performance/noImgElement: Direct rendered ticket image (D-165, D-168)
                        <img
                          src={ticketImageUrls[tkt.id]}
                          alt={`บัตรเข้างาน ${tkt.ticketCode} - ${tkt.eventTitle}`}
                          className="classic-ticket-img"
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            borderRadius: 0,
                            boxShadow: '0 4px 18px rgba(15, 23, 42, 0.08)',
                          }}
                        />
                      ) : (
                        <>
                          {/* Left: Main Ticket Stub Area */}
                          <div className="stub-main-body">
                            <h3 className="stub-event-title">{tkt.eventTitle}</h3>
                            <div className="stub-zone-badge">
                              {tkt.ticketTypeName}
                            </div>

                            <div className="stub-meta-grid">
                              <div className="stub-meta-item">
                                <span className="stub-meta-label">วันและเวลาแสดง (DATE & TIME)</span>
                                <strong className="stub-meta-value">
                                  {formatDate(new Date(tkt.sessionStartTime))} เวลา {formatTime(new Date(tkt.sessionStartTime))}
                                  {tkt.sessionEndTime ? ` - ${formatTime(new Date(tkt.sessionEndTime))}` : ''}
                                </strong>
                              </div>
                              <div className="stub-meta-item">
                                <span className="stub-meta-label">สถานที่จัดงาน (VENUE)</span>
                                <strong className="stub-meta-value">{tkt.location}</strong>
                              </div>
                              <div className="stub-meta-item">
                                <span className="stub-meta-label">ผู้สั่งซื้อ (BUYER)</span>
                                <strong className="stub-meta-value">{tkt.buyerName}</strong>
                              </div>
                              <div className="stub-meta-item">
                                <span className="stub-meta-label">รหัสบัตร (TICKET CODE)</span>
                                <strong className="stub-meta-value stub-monospace">{tkt.ticketCode}</strong>
                              </div>
                              <div className="stub-meta-item">
                                <span className="stub-meta-label">หมายเลขคำสั่งซื้อ (ORDER ID)</span>
                                <strong className="stub-meta-value stub-monospace">{tkt.orderId}</strong>
                              </div>
                            </div>

                            <div className="stub-footer-note">
                              * กรุณาแสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน · บัตรนี้สามารถสแกนได้ 1 ครั้ง
                            </div>
                          </div>

                          {/* Divider: Straight Dashed Line (D-163, D-167) */}
                          <div className="stub-divider-straight stub-notch-divider" aria-hidden="true" />

                          {/* Right: Scan Stub Area */}
                          <div className="stub-scan-side">
                            <div className="stub-qr-frame">
                              {/* biome-ignore lint/performance/noImgElement: Data URL SVG QR representation */}
                              <img
                                id={`ticket-qr-${idx}`}
                                src={tkt.qrCodeUrl}
                                alt={`QR Code ${tkt.ticketCode}`}
                                width={160}
                                height={160}
                                style={{ display: 'block', margin: '0 auto' }}
                              />
                            </div>

                            <div className="stub-code-label">รหัสบัตรสำหรับเข้างาน</div>
                            <div className="stub-code-value">
                              <strong id={`ticket-code-${idx}`}>{tkt.ticketCode}</strong>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Individual Ticket Download Button (D-52) */}
                    <div className="stub-download-action-bar">
                      <button
                        type="button"
                        onClick={() => handleDownloadSingle(tkt)}
                        disabled={downloadingId === tkt.id}
                        className="button stub-download-btn"
                      >
                        <DownloadIcon style={{ width: '16px', height: '16px' }} />
                        <span>
                          {downloadingId === tkt.id
                            ? 'กำลังบันทึกรูปบัตร...'
                            : `บันทึกรูปบัตรใบที่ ${idx + 1} (PNG 1200 x 500 px)`}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Quick Navigation */}
              <div className="tickets-bottom-actions">
                <button
                  type="button"
                  onClick={() => setActiveTab('receipt')}
                  className="button secondary-button"
                >
                  <ReceiptIcon style={{ width: '16px', height: '16px' }} />
                  <span>ดูสลิปการชำระเงิน</span>
                </button>
                <Link
                  href={`/my-tickets?orderId=${reservation.id}`}
                  className="button button-link"
                >
                  <span>ไปที่หน้า ค้นหาบัตรของฉัน</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dev Mailbox Modal Dialog */}
      {devEmailModalOpen && (
        <div
          className="otp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dev-email-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
        >
          <div
            className="dev-email-modal-card"
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MailIcon style={{ width: '20px', height: '20px', color: '#0f172a' }} />
                <h3 id="dev-email-modal-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                  จำลองการส่งอีเมลตั๋ว (Dev Mail Preview)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDevEmailModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <XIcon style={{ width: '20px', height: '20px' }} />
              </button>
            </div>

            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1 }}>
              {isLoadingDevEmail ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  กำลังโหลดข้อมูลอีเมล...
                </div>
              ) : !capturedEmail ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  ยังไม่พบข้อมูลอีเมลในระบบจำลอง (Captured Emails)
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      background: '#f1f5f9',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      marginBottom: '1rem',
                      lineHeight: 1.6,
                    }}
                  >
                    <div>
                      <strong>ผู้รับ (To):</strong> {capturedEmail.to}
                    </div>
                    <div>
                      <strong>หัวข้อ (Subject):</strong> {capturedEmail.subject}
                    </div>
                  </div>

                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '1rem',
                      background: '#ffffff',
                    }}
                  >
                    {capturedEmail.html ? (
                      <div
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: Dev email preview
                        dangerouslySetInnerHTML={{ __html: capturedEmail.html }}
                      />
                    ) : (
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: '0.9rem' }}>
                        {capturedEmail.text}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                padding: '0.75rem 1.25rem',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setDevEmailModalOpen(false)}
                className="button button-primary"
                style={{ padding: '0.45rem 1.2rem', fontSize: '0.88rem' }}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
