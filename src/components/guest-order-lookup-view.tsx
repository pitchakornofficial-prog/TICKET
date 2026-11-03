'use client';

import { useState, useEffect, useRef } from 'react';
import type { GuestOrderSummary } from '@/server/guest-order-lookup';
import type { TicketDetail } from '@/server/tickets';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import {
  SearchIcon,
  CalendarIcon,
  MapPinIcon,
  ClockIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
  InfoIcon,
  RefreshIcon,
  DownloadIcon,
  SparklesIcon,
} from './icons';
import { AlertIcon } from './alert-icon';
import { TicketIcon } from './ticket-icon';
import { downloadTicketAsPng, downloadAllTicketsAsPng, generateTicketDataUrl } from './ticket-canvas-download';
import { FloatingBackToTop } from './floating-back-to-top';

interface GuestOrderLookupViewProps {
  initialOrderId?: string;
}

const OTP_BOX_KEYS = [0, 1, 2, 3, 4, 5];

export function GuestOrderLookupView({ initialOrderId }: GuestOrderLookupViewProps) {
  const [mode, setMode] = useState<'search' | 'otp' | 'orders'>('search');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orderId, setOrderId] = useState(initialOrderId || '');
  const [requestId, setRequestId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [_token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<GuestOrderSummary[]>([]);
  const [buyerInfo, setBuyerInfo] = useState<{ email: string; phone: string; name: string } | null>(
    null,
  );
  const [_expandedOrderId, setExpandedOrderId] = useState<string | null>(initialOrderId || null);
  const [filterTab, setFilterTab] = useState<'all' | 'upcoming' | 'past'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'date_asc'>('newest');
  const [downloadingTicketId, setDownloadingTicketId] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [expandedConcertKeys, setExpandedConcertKeys] = useState<Record<string, boolean>>({});
  const [ticketImageUrls, setTicketImageUrls] = useState<Record<string, string>>({});
  const [isPolicyExpanded, setIsPolicyExpanded] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Ephemeral lookup session: clear session when user leaves page (D-166)
  useEffect(() => {
    if (mode !== 'orders') return;
    const clearSession = () => {
      sessionStorage.removeItem('ticket_guest_lookup_token');
    };
    window.addEventListener('pagehide', clearSession);
    window.addEventListener('beforeunload', clearSession);
    return () => {
      window.removeEventListener('pagehide', clearSession);
      window.removeEventListener('beforeunload', clearSession);
    };
  }, [mode]);

  // Automatically generate direct ticket image passes (D-165)
  useEffect(() => {
    let active = true;
    async function loadTicketImages() {
      for (const ord of orders) {
        for (const tkt of ord.tickets || []) {
          if (!ticketImageUrls[tkt.id]) {
            try {
              const url = await generateTicketDataUrl(tkt);
              if (active) {
                setTicketImageUrls(prev => ({ ...prev, [tkt.id]: url }));
              }
            } catch {
              // fallback is handled
            }
          }
        }
      }
    }
    if (orders.length > 0) {
      loadTicketImages();
    }
    return () => {
      active = false;
    };
  }, [orders, ticketImageUrls]);

  // Check existing session token in sessionStorage on load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!orderId) {
      const urlParams = new URLSearchParams(window.location.search);
      const queryOrderId = urlParams.get('orderId');
      if (queryOrderId) {
        setOrderId(queryOrderId);
        setExpandedOrderId(queryOrderId);
      }
    }

    const savedToken = sessionStorage.getItem('ticket_guest_lookup_token');
    if (!savedToken) return;

    setIsLoading(true);
    fetch('/api/public/orders', {
      headers: {
        'x-guest-session': savedToken,
      },
    })
      .then(async res => {
        if (!res.ok) {
          sessionStorage.removeItem('ticket_guest_lookup_token');
          setIsLoading(false);
          return;
        }
        const data = await res.json();
        setToken(savedToken);
        // D-57 Wallet-First UX: strictly filter to paid orders with issued tickets
        const paidOrders = (data.orders || []).filter((o: GuestOrderSummary) => o.status === 'paid');
        setOrders(paidOrders);
        setBuyerInfo(data.buyer || null);
        setMode('orders');
        setIsLoading(false);
      })
      .catch(() => {
        sessionStorage.removeItem('ticket_guest_lookup_token');
        setIsLoading(false);
      });
  }, [orderId]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    const cleanPhone = phone.trim();

    if (!cleanEmail) {
      setError('กรุณากรอกอีเมลที่ใช้สั่งซื้อ');
      return;
    }
    if (!cleanPhone) {
      setError('กรุณากรอกเบอร์โทรศัพท์ที่ใช้สั่งซื้อ');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/public/orders/request-lookup-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          phone: cleanPhone,
          orderId: orderId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ไม่สามารถขอรหัส OTP ได้');
        if (data.cooldownSeconds) {
          setCooldownSeconds(data.cooldownSeconds);
        }
        setIsLoading(false);
        return;
      }

      setRequestId(data.requestId);
      setCooldownSeconds(data.cooldownSeconds || 60);
      if (data.devOtpCode) {
        setDevOtpCode(data.devOtpCode);
      }
      setOtpCode('');
      setOtpDigits(['', '', '', '', '', '']);
      setMode('otp');
      setIsLoading(false);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
      setIsLoading(false);
    }
  };

  // OTP digit manipulation (D-44 / D-56 6-box pattern)
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

  // Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = otpCode.trim();
    if (cleanCode?.length !== 6) {
      setError('กรุณากรอกรหัส OTP 6 หลัก');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/public/orders/verify-lookup-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          phone: phone.trim(),
          code: cleanCode,
          requestId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'รหัส OTP ไม่ถูกต้อง');
        setIsLoading(false);
        return;
      }

      const verifiedToken = data.token;
      sessionStorage.setItem('ticket_guest_lookup_token', verifiedToken);
      setToken(verifiedToken);

      // Fetch buyer orders
      const ordersRes = await fetch('/api/public/orders', {
        headers: {
          'x-guest-session': verifiedToken,
        },
      });

      if (!ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setError(ordersData.message || 'ไม่สามารถเปิดดูคำสั่งซื้อได้');
        setIsLoading(false);
        return;
      }

      const ordersData = await ordersRes.json();
      // D-57 Wallet-First UX: strictly filter to paid orders with issued tickets
      const paidOrders = (ordersData.orders || []).filter((o: GuestOrderSummary) => o.status === 'paid');
      setOrders(paidOrders);
      setBuyerInfo(ordersData.buyer || null);
      setMode('orders');
      setIsLoading(false);
    } catch {
      setError('เกิดข้อผิดพลาดในการตรวจสอบ OTP กรุณาลองใหม่อีกครั้ง');
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (cooldownSeconds > 0) return;
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/public/orders/request-lookup-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          phone: phone.trim(),
          orderId: orderId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ไม่สามารถขอรหัส OTP ใหม่ได้');
        if (data.cooldownSeconds) {
          setCooldownSeconds(data.cooldownSeconds);
        }
        setIsLoading(false);
        return;
      }

      setRequestId(data.requestId);
      setCooldownSeconds(data.cooldownSeconds || 60);
      if (data.devOtpCode) {
        setDevOtpCode(data.devOtpCode);
      }
      setIsLoading(false);
    } catch {
      setError('เกิดข้อผิดพลาดในการขอรหัส OTP ใหม่');
      setIsLoading(false);
    }
  };

  // Sign out / Clear session helper
  const _handleClearSession = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('ticket_guest_lookup_token');
    }
    setToken(null);
    setOrders([]);
    setBuyerInfo(null);
    setOtpCode('');
    setOtpDigits(['', '', '', '', '', '']);
    setRequestId('');
    setMode('search');
    setError(null);
  };

  // Single ticket PNG download
  const handleDownloadSingle = async (ticket: TicketDetail) => {
    try {
      setDownloadingTicketId(ticket.id);
      await downloadTicketAsPng(ticket);
    } catch (err) {
      console.error('Failed to download ticket image:', err);
    } finally {
      setDownloadingTicketId(null);
    }
  };

  // All tickets PNG download for a concert group
  const handleDownloadAll = async (ticketsToDownload: TicketDetail[]) => {
    try {
      setIsDownloadingAll(true);
      await downloadAllTicketsAsPng(ticketsToDownload);
    } catch (err) {
      console.error('Failed to download all ticket images:', err);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  // Grouping & Filtering Helpers
  const nowTime = Date.now();
  const isEventUpcoming = (order: GuestOrderSummary) => {
    const endTime = new Date(order.sessionEndTime).getTime();
    return Number.isNaN(endTime) || endTime >= nowTime;
  };

  const upcomingCount = orders.filter(isEventUpcoming).length;
  const pastCount = orders.filter(o => !isEventUpcoming(o)).length;

  const trimmedSearch = searchQuery.trim().toLowerCase();

  const filteredOrders = orders.filter(order => {
    // 1. Status Filter Tab
    if (filterTab === 'upcoming' && !isEventUpcoming(order)) return false;
    if (filterTab === 'past' && isEventUpcoming(order)) return false;

    // 2. Omni-Search Query: Event title, Order ID, Location, Ticket Code, Ticket Type Name (D-170)
    if (trimmedSearch) {
      const matchTitle = order.eventTitle?.toLowerCase().includes(trimmedSearch);
      const matchOrderId = order.id?.toLowerCase().includes(trimmedSearch);
      const matchLocation = order.location?.toLowerCase().includes(trimmedSearch);
      const matchTicketCode = order.tickets?.some(t => t.ticketCode?.toLowerCase().includes(trimmedSearch));
      const matchTicketType =
        order.tickets?.some(t => t.ticketTypeName?.toLowerCase().includes(trimmedSearch)) ||
        order.items?.some(it => it.ticketTypeName?.toLowerCase().includes(trimmedSearch));
      if (!matchTitle && !matchOrderId && !matchLocation && !matchTicketCode && !matchTicketType) {
        return false;
      }
    }

    return true;
  });

  const displayedOrders = [...filteredOrders].sort((a, b) => {
    if (sortBy === 'oldest') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sortBy === 'date_asc') {
      return new Date(a.sessionStartTime).getTime() - new Date(b.sessionStartTime).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  interface ConcertGroup {
    groupKey: string;
    eventId: string;
    eventTitle: string;
    location: string;
    posterUrl: string | null;
    sessionStartTime: string;
    sessionEndTime: string;
    isUpcoming: boolean;
    orders: GuestOrderSummary[];
    allPaidTickets: TicketDetail[];
  }

  const concertGroups = displayedOrders.reduce<ConcertGroup[]>((groups, order) => {
    const groupKey = `${order.eventId}_${order.sessionId}`;
    let group = groups.find(g => g.groupKey === groupKey);
    if (!group) {
      group = {
        groupKey,
        eventId: order.eventId,
        eventTitle: order.eventTitle,
        location: order.location,
        posterUrl: order.posterUrl,
        sessionStartTime: order.sessionStartTime,
        sessionEndTime: order.sessionEndTime,
        isUpcoming: isEventUpcoming(order),
        orders: [],
        allPaidTickets: [],
      };
      groups.push(group);
    }
    group.orders.push(order);
    if (order.status === 'paid' && order.tickets?.length > 0) {
      group.allPaidTickets.push(...order.tickets);
    }
    return groups;
  }, []);

  const _uniqueBuyerNames = Array.from(new Set(orders.map(o => o.buyerName).filter(Boolean)));

  const toggleConcertExpand = (groupKey: string, defaultExpanded: boolean) => {
    setExpandedConcertKeys(prev => {
      const current = prev[groupKey] !== undefined ? prev[groupKey] : defaultExpanded;
      return {
        ...prev,
        [groupKey]: !current,
      };
    });
  };

  return (
    <div className="lookup-page-wrapper">
      {/* Top Header */}
      <div className="lookup-hero-header">
        <h1 className="lookup-hero-title">ค้นหาบัตรคอนเสิร์ตของฉัน</h1>
        <p className="lookup-hero-desc">
          กระเป๋าตั๋วดิจิทัล ตรวจสอบบัตรเข้างาน และแสดง QR Code สำหรับสแกนเข้างาน (ไม่ต้องสมัครสมาชิก)
        </p>
      </div>

      {/* Mode 1: Modern Clean Search Form */}
      {mode === 'search' && (
        <div className="lookup-center-card">
          <div className="lookup-card-top-icon">
            <SearchIcon style={{ width: '26px', height: '26px' }} />
          </div>

          {orderId && (
            <div className="lookup-notice-box lookup-notice-info">
              <InfoIcon style={{ width: '18px', height: '18px', flexShrink: 0, marginTop: '2px' }} />
              <div>
                กำลังค้นหาคำสั่งซื้อ <strong>{orderId}</strong> — กรุณากรอกอีเมลและเบอร์โทรศัพท์ที่ใช้สั่งซื้อเพื่อยืนยันตัวตน
              </div>
            </div>
          )}

          {error && (
            <div className="lookup-notice-box lookup-notice-error">
              <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: '2px' }}>
                <AlertIcon />
              </span>
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleRequestOtp}>
            <div className="lookup-field-group">
              <label htmlFor="lookup-email" className="lookup-field-label">
                อีเมลที่ใช้สั่งซื้อ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="lookup-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@mail.com"
                required
                className="lookup-field-input"
              />
            </div>

            <div className="lookup-field-group" style={{ marginBottom: '1.75rem' }}>
              <label htmlFor="lookup-phone" className="lookup-field-label">
                เบอร์โทรศัพท์ที่ใช้สั่งซื้อ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="lookup-phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0812345678"
                required
                className="lookup-field-input"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="lookup-submit-btn"
            >
              <SearchIcon style={{ width: '18px', height: '18px' }} />
              <span>{isLoading ? 'กำลังตรวจสอบ...' : 'ขอรหัส OTP เพื่อเปิดดูบัตร'}</span>
            </button>
          </form>

          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '1.25rem', textAlign: 'center', lineHeight: 1.5 }}>
            * เพื่อความปลอดภัยของข้อมูล ระบบจะส่งรหัส OTP 6 หลักไปยังอีเมลเพื่อยืนยันตัวตนก่อนเปิดแสดงบัตรและ QR Code
          </p>
        </div>
      )}

      {/* Mode 2: Modern Centered 6-Box OTP Form */}
      {mode === 'otp' && (
        <div className="lookup-center-card">
          <div className="lookup-card-top-icon">
            <ShieldCheckIcon style={{ width: '28px', height: '28px' }} />
          </div>

          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.4rem 0' }}>
              ยืนยันรหัส OTP
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#475569', margin: '0 0 0.35rem 0' }}>
              ระบบได้ส่งรหัส OTP 6 หลักไปยังอีเมล <strong>{email}</strong> แล้ว
            </p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
              รหัสมีอายุการใช้งาน 5 นาที
            </p>
          </div>

          {/* Dev Test OTP Banner (D-47, D-161) */}
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

          {error && (
            <div className="lookup-notice-box lookup-notice-error">
              <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: '2px' }}>
                <AlertIcon />
              </span>
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleVerifyOtp}>
            <div style={{ marginBottom: '1.75rem', textAlign: 'center' }}>
              <label
                htmlFor="lookup-otp-code"
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
                    id={idx === 0 ? 'lookup-otp-code' : `lookup-otp-code-${idx}`}
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
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCode.length !== 6}
              className="lookup-submit-btn"
              style={{ marginBottom: '1.25rem' }}
            >
              <span>{isLoading ? 'กำลังยืนยัน...' : 'ยืนยันรหัส OTP'}</span>
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => {
                setMode('search');
                setError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0,
              }}
            >
              <ArrowLeftIcon style={{ width: '15px', height: '15px' }} />
              <span>แก้ไขอีเมลหรือเบอร์โทร</span>
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={cooldownSeconds > 0 || isLoading}
              style={{
                background: 'none',
                border: 'none',
                color: cooldownSeconds > 0 ? '#94a3b8' : '#1848ed',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: cooldownSeconds > 0 || isLoading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0,
              }}
            >
              <RefreshIcon style={{ width: '15px', height: '15px' }} />
              <span>{cooldownSeconds > 0 ? `ขอรหัสใหม่ได้ใน ${cooldownSeconds}s` : 'ขอรหัส OTP ใหม่'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Mode 3: Modern Concert-Grouped Orders View */}
      {mode === 'orders' && (
        <div>
          {/* Active Session Header Bar (D-166) */}
          <div className="lookup-session-header">
            <div className="lookup-session-user">
              <div className="lookup-session-avatar">
                <TicketIcon style={{ width: '24px', height: '24px', color: '#0f172a' }} />
              </div>
              <div className="lookup-session-contact-prominent">
                อีเมล: {buyerInfo?.email} · โทรศัพท์: {buyerInfo?.phone}
              </div>
            </div>
          </div>

          {/* Unified Search & Filter Toolbar (D-170) */}
          {orders.length > 0 && (
            <div className="lookup-search-filter-toolbar">
              {/* Left: Omni-Search Input */}
              <div className="lookup-search-box">
                <SearchIcon style={{ width: '18px', height: '18px', color: '#64748b', flexShrink: 0 }} />
                <input
                  id="lookup-ticket-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่องาน, รหัสคำสั่งซื้อ, รหัสบัตร, สถานที่..."
                  className="lookup-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="lookup-search-clear-btn"
                    aria-label="ล้างคำค้นหา"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Right: Status Tabs & Sort Controls */}
              <div className="lookup-toolbar-right">
                <div className="lookup-tabs-wrap" role="tablist" aria-label="กรองสถานะคอนเสิร์ต">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filterTab === 'all'}
                    onClick={() => setFilterTab('all')}
                    className={`lookup-tab-pill ${filterTab === 'all' ? 'active' : ''}`}
                  >
                    ทั้งหมด ({orders.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filterTab === 'upcoming'}
                    onClick={() => setFilterTab('upcoming')}
                    className={`lookup-tab-pill ${filterTab === 'upcoming' ? 'active' : ''}`}
                  >
                    เร็วๆ นี้ ({upcomingCount})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filterTab === 'past'}
                    onClick={() => setFilterTab('past')}
                    className={`lookup-tab-pill ${filterTab === 'past' ? 'active' : ''}`}
                  >
                    ที่ผ่านมา ({pastCount})
                  </button>
                </div>

                <div className="lookup-sort-wrap">
                  <label htmlFor="lookup-sort-select" className="lookup-sort-label">
                    เรียงตาม:
                  </label>
                  <select
                    id="lookup-sort-select"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'date_asc')}
                    className="lookup-sort-select"
                  >
                    <option value="newest">คำสั่งซื้อล่าสุด</option>
                    <option value="oldest">คำสั่งซื้อแรกสุด</option>
                    <option value="date_asc">วันแสดงเร็วๆ นี้</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {orders.length === 0 ? (
            <div className="lookup-center-card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
              <div className="lookup-card-top-icon" style={{ background: '#f1f5f9', color: '#64748b' }}>
                <TicketIcon style={{ width: '28px', height: '28px' }} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                ไม่พบบัตรคอนเสิร์ตที่ชำระเงินสำเร็จ
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>
                หน้าค้นหาตั๋วจะแสดงเฉพาะบัตรที่ชำระเงินเรียบร้อยแล้วเท่านั้น หากท่านเพิ่งทำการจอง กรุณาตรวจสอบอีเมลหรือดำเนินการชำระเงินให้เสร็จสิ้น
              </p>
            </div>
          ) : displayedOrders.length === 0 ? (
            <div className="lookup-center-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
              <div className="lookup-card-top-icon" style={{ background: '#f1f5f9', color: '#64748b' }}>
                <SearchIcon style={{ width: '28px', height: '28px' }} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                ไม่พบบัตรคอนเสิร์ตที่ตรงกับคำค้นหา
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
                {trimmedSearch
                  ? `ไม่พบรายการที่ตรงกับ "${searchQuery}" ในหมวดหมู่นี้`
                  : 'ไม่มีรายการบัตรคอนเสิร์ตในหมวดหมู่นี้'}
              </p>
              {(trimmedSearch || filterTab !== 'all') && (
                <button
                  type="button"
                  id="lookup-clear-filters-btn"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterTab('all');
                  }}
                  className="button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.6rem 1.25rem',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  ล้างการค้นหาและตัวกรองทั้งหมด
                </button>
              )}
            </div>
          ) : (
            /* Concert Groups */
            <div>
              {concertGroups.map((group, groupIdx) => {
                const isConcertExpanded =
                  expandedConcertKeys[group.groupKey] !== undefined
                    ? expandedConcertKeys[group.groupKey]
                    : groupIdx === 0;

                return (
                  <div key={group.groupKey} className="lookup-concert-card">
                    {/* Concert Header Banner */}
                    <div className="lookup-concert-header">
                      <div>
                        <h3 className="lookup-concert-title">{group.eventTitle}</h3>
                        <div className="lookup-concert-meta">
                          <div className="lookup-concert-meta-row">
                            <MapPinIcon style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                            <span>{group.location}</span>
                          </div>
                          <div className="lookup-concert-meta-row">
                            <CalendarIcon style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                            <span>
                              {formatDate(new Date(group.sessionStartTime))} เวลา {formatTime(new Date(group.sessionStartTime))} - {formatTime(new Date(group.sessionEndTime))}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="lookup-concert-badge-group">
                        <button
                          type="button"
                          onClick={() => toggleConcertExpand(group.groupKey, groupIdx === 0)}
                          className="concert-toggle-btn"
                        >
                          <span>{isConcertExpanded ? 'ย่อเก็บ' : `ดูตั๋วเข้างาน (${group.allPaidTickets.length} ใบ)`}</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, marginLeft: '6px', lineHeight: 1 }}>{isConcertExpanded ? '−' : '+'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Concert Body (Expandable) */}
                    {isConcertExpanded && (
                      <div className="lookup-concert-body">
                        {group.orders.map((order, orderIdx) => {
                          const isPaid = order.status === 'paid';

                          return (
                            <div
                              key={order.id}
                              id={`order-${order.id}`}
                              className="lookup-order-flat"
                              style={{
                                borderTop: orderIdx > 0 ? '1px dashed #e2e8f0' : 'none',
                                paddingTop: orderIdx > 0 ? '1.75rem' : '0',
                                marginBottom: '1.5rem',
                              }}
                            >
                              {/* Order Top Bar */}
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  gap: '0.75rem',
                                  paddingBottom: '1.25rem',
                                  borderBottom: '1px solid #f1f5f9',
                                  marginBottom: '1.5rem',
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    รหัสคำสั่งซื้อ
                                  </div>
                                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                                    {order.id}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  {isPaid && (
                                    <span
                                      style={{
                                        backgroundColor: '#dcfce7',
                                        color: '#15803d',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                      }}
                                    >
                                      <CheckCircleIcon style={{ width: '15px', height: '15px' }} />
                                      <span>ชำระเงินสำเร็จ</span>
                                    </span>
                                  )}
                                  {order.status === 'reserved' && (
                                    <span
                                      style={{
                                        backgroundColor: '#fef9c3',
                                        color: '#854d0e',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                      }}
                                    >
                                      <ClockIcon style={{ width: '15px', height: '15px' }} />
                                      <span>รอชำระเงิน</span>
                                    </span>
                                  )}
                                  {order.status === 'expired' && (
                                    <span
                                      style={{
                                        backgroundColor: '#f1f5f9',
                                        color: '#64748b',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                      }}
                                    >
                                      <span style={{ display: 'inline-flex', width: '15px', height: '15px' }}>
                                        <AlertIcon />
                                      </span>
                                      <span>หมดเวลาจอง</span>
                                    </span>
                                  )}
                                  {order.status === 'cancelled' && (
                                    <span
                                      style={{
                                        backgroundColor: '#fee2e2',
                                        color: '#b91c1c',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                      }}
                                    >
                                      <span style={{ display: 'inline-flex', width: '15px', height: '15px' }}>
                                        <AlertIcon />
                                      </span>
                                      <span>ยกเลิกคำสั่งซื้อ</span>
                                    </span>
                                  )}
                                  {order.status === 'payment_exception' && (
                                    <span
                                      style={{
                                        backgroundColor: '#fef3c7',
                                        color: '#b45309',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                      }}
                                    >
                                      <span style={{ display: 'inline-flex', width: '15px', height: '15px' }}>
                                        <AlertIcon />
                                      </span>
                                      <span>รอเจ้าหน้าที่ตรวจสอบ</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Email Delivery Warning */}
                              {isPaid && order.emailDelivery?.status === 'failed' && (
                                <div className="lookup-notice-box lookup-notice-info" style={{ marginBottom: '1.5rem' }}>
                                  <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: '2px' }}>
                                    <AlertIcon />
                                  </span>
                                  <div>
                                    <strong>ระบบส่งอีเมลไม่สำเร็จ:</strong> แต่บัตรของท่านออกสมบูรณ์แล้ว สามารถใช้ QR Code ด้านล่างนี้เพื่อแสดงต่อเจ้าหน้าที่เข้างานได้ทันที
                                  </div>
                                </div>
                              )}

                              {/* Issued Tickets Section */}
                              {isPaid && order.tickets.length > 0 && (
                                <div style={{ marginBottom: '1.75rem' }}>
                                  <div className="lookup-tickets-header-row">
                                    <div>
                                      <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.25rem 0' }}>
                                        รายการบัตรเข้างาน ({order.tickets.length} ใบ)
                                      </h4>
                                      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                                        แต่ละใบมี QR Code เฉพาะแยกใบ กรุณาแสดง QR Code ต่อเจ้าหน้าที่ ณ จุดตรวจเข้างาน
                                      </p>
                                    </div>

                                    {order.tickets.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadAll(order.tickets)}
                                        disabled={isDownloadingAll}
                                        className="primary-button"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.5rem',
                                          fontSize: '0.88rem',
                                          padding: '0.55rem 1rem',
                                        }}
                                      >
                                        <DownloadIcon style={{ width: '16px', height: '16px' }} />
                                        <span>
                                          {isDownloadingAll ? 'กำลังบันทึกรูป...' : `บันทึกรูปบัตรทั้งหมดลงเครื่อง (${order.tickets.length} ใบ)`}
                                        </span>
                                      </button>
                                    )}
                                  </div>

                                  {/* Clean Sequential Ticket Passes Stack (D-171) */}
                                  <div className="ticket-stubs-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {order.tickets.map(tkt => (
                                      <div
                                        key={tkt.id}
                                        className="ticket-stub-wrapper"
                                      >
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
                                            // biome-ignore lint/performance/noImgElement: Direct rendered ticket image (D-165)
                                            <img
                                              src={ticketImageUrls[tkt.id]}
                                              alt={`บัตรเข้างาน ${tkt.ticketCode} - ${tkt.eventTitle || order.eventTitle}`}
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
                                                <div className="stub-event-title">{tkt.eventTitle || order.eventTitle}</div>
                                                <div className="stub-zone-badge">
                                                  {tkt.ticketTypeName}
                                                </div>

                                                <div className="stub-meta-grid">
                                                  <div className="stub-meta-item">
                                                    <span className="stub-meta-label">วันและเวลาแสดง (DATE & TIME)</span>
                                                    <strong className="stub-meta-value">
                                                      {formatDate(new Date(tkt.sessionStartTime || order.sessionStartTime))} เวลา {formatTime(new Date(tkt.sessionStartTime || order.sessionStartTime))}{tkt.sessionEndTime || order.sessionEndTime ? ` - ${formatTime(new Date(tkt.sessionEndTime || order.sessionEndTime))}` : ''}
                                                    </strong>
                                                  </div>
                                                  <div className="stub-meta-item">
                                                    <span className="stub-meta-label">สถานที่จัดงาน (VENUE)</span>
                                                    <strong className="stub-meta-value">{tkt.location || order.location}</strong>
                                                  </div>
                                                  <div className="stub-meta-item">
                                                    <span className="stub-meta-label">ผู้สั่งซื้อ (BUYER)</span>
                                                    <strong className="stub-meta-value">{tkt.buyerName || order.buyerName}</strong>
                                                  </div>
                                                  <div className="stub-meta-item">
                                                    <span className="stub-meta-label">รหัสบัตร (TICKET CODE)</span>
                                                    <strong className="stub-meta-value stub-monospace">{tkt.ticketCode}</strong>
                                                  </div>
                                                  <div className="stub-meta-item">
                                                    <span className="stub-meta-label">หมายเลขคำสั่งซื้อ (ORDER ID)</span>
                                                    <strong className="stub-meta-value stub-monospace">{tkt.orderId || order.id}</strong>
                                                  </div>
                                                </div>

                                                <div className="stub-footer-note">
                                                  * กรุณาแสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน · บัตรนี้สามารถสแกนได้ 1 ครั้ง
                                                </div>
                                              </div>

                                              {/* Divider: Straight Dashed Line (D-163) */}
                                              <div className="stub-divider-straight" aria-hidden="true" />

                                              {/* Right: Scan Stub Area */}
                                              <div className="stub-scan-side">
                                                <div className="stub-qr-frame">
                                                  {/* biome-ignore lint/performance/noImgElement: Data URL SVG QR representation */}
                                                  <img
                                                    id={`ticket-qr-${tkt.id}`}
                                                    src={tkt.qrCodeUrl}
                                                    alt={`QR Code บัตร ${tkt.ticketCode}`}
                                                    width={160}
                                                    height={160}
                                                    style={{ display: 'block', margin: '0 auto' }}
                                                  />
                                                </div>

                                                <div className="stub-code-label">รหัสบัตรสำหรับเข้างาน</div>
                                                <div className="stub-code-value">
                                                  <strong id={`ticket-code-${tkt.id}`}>{tkt.ticketCode}</strong>
                                                </div>
                                              </div>
                                            </>
                                          )}
                                        </div>

                                        {/* Action Bar: Download PNG Button */}
                                        <div className="stub-download-bar" style={{ marginTop: '0.65rem', display: 'flex', justifyContent: 'flex-end' }}>
                                          <button
                                            type="button"
                                            id={`download-ticket-${tkt.id}-btn`}
                                            onClick={() => handleDownloadSingle(tkt)}
                                            disabled={downloadingTicketId === tkt.id}
                                            className="secondary-button stub-download-single-btn"
                                          >
                                            <DownloadIcon style={{ width: '16px', height: '16px' }} />
                                            <span>
                                              {downloadingTicketId === tkt.id
                                                ? 'กำลังบันทึกรูป...'
                                                : 'บันทึกรูปบัตร PNG'}
                                            </span>
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Order Details & Refund Integration */}
                              {/* Order Details & Financial Summary (D-162) */}
                              <div className="lookup-order-accordions" style={{ marginTop: '1.75rem' }}>
                                <div style={{ marginBottom: '0.85rem' }}>
                                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                                    รายละเอียดคำสั่งซื้อและการเงิน
                                  </span>
                                </div>

                                <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '1.15rem 1.25rem', fontSize: '0.88rem', border: '1px solid #e2e8f0' }}>
                                  <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.65rem 0' }}>
                                    สรุปยอดเงิน
                                  </h4>
                                  {order.items && order.items.length > 0 ? (
                                    order.items.map(item => (
                                      <div key={item.id || item.ticketTypeId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                        <span style={{ color: '#64748b' }}>{item.ticketTypeName} x {item.quantity} ใบ</span>
                                        <span style={{ fontWeight: 600 }}>{formatBaht(item.subtotal)}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                      <span style={{ color: '#64748b' }}>{order.tickets[0]?.ticketTypeName || 'บัตรเข้าชม'} x {order.tickets.length} ใบ</span>
                                      <span style={{ fontWeight: 600 }}>{formatBaht(order.subtotal)}</span>
                                    </div>
                                  )}

                                  {order.discountAmount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', color: '#16a34a' }}>
                                      <span>ส่วนลด</span>
                                      <span style={{ fontWeight: 600 }}>-{formatBaht(order.discountAmount)}</span>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                    <span style={{ color: '#64748b' }}>ค่าบริการลูกค้า</span>
                                    <span>{formatBaht(order.customerFee)}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.55rem', marginTop: '0.55rem', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                                    <span>ยอดชำระทั้งหมด</span>
                                    <span style={{ color: '#1848ed' }}>{formatBaht(order.total)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Standalone Refund & Concert Policy Card (D-166) */}
          <div className="lookup-policy-card standalone-policy-card" style={{ marginTop: '2rem' }}>
            <button
              type="button"
              onClick={() => setIsPolicyExpanded(prev => !prev)}
              className="lookup-policy-summary"
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.35rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <InfoIcon style={{ width: '18px', height: '18px', color: '#0f172a', flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                  นโยบายและเงื่อนไขการขอคืนเงิน
                </span>
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                {isPolicyExpanded ? '−' : '+'}
              </span>
            </button>
            {isPolicyExpanded && (
              <div className="lookup-policy-content" style={{ padding: '0 1.35rem 1.25rem 1.35rem' }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                  การขอคืนเงินสามารถทำได้ตามเงื่อนไขที่ผู้จัดงานกำหนด โดยต้องยื่นคำขอล่วงหน้าก่อนถึงวันเริ่มการแสดงอย่างน้อย 168 ชั่วโมง (7 วันทำการ) หรือตามกรอบระยะเวลาของคอนเสิร์ต
                </p>
                <p style={{ margin: '0 0 0.85rem 0' }}>
                  ระบบจะดำเนินการคืนเงินเข้าสู่บัญชีเดิมที่ใช้ในการสั่งซื้อ บัตรที่ใช้สแกนเข้างานแล้ว หรือเกินระยะเวลาที่กำหนดจะไม่สามารถยื่นขอคืนเงินได้
                </p>
                <div>
                  <a
                    href="/refund-policy"
                    className="lookup-policy-link"
                    style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    อ่านนโยบายและเงื่อนไขการขอคืนเงินฉบับเต็ม
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Universal Floating Back-to-Top Button (D-172) */}
      <FloatingBackToTop testId="lookup-back-to-top-btn" />
    </div>
  );
}
