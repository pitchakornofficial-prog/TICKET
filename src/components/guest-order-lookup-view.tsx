'use client';

import { useState, useEffect } from 'react';
import type { GuestOrderSummary } from '@/server/guest-order-lookup';
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
} from './icons';
import { AlertIcon } from './alert-icon';
import { TicketIcon } from './ticket-icon';
import { GuestOrderRefundManager } from './guest-order-refund-manager';

interface GuestOrderLookupViewProps {
  initialOrderId?: string;
}

export function GuestOrderLookupView({ initialOrderId }: GuestOrderLookupViewProps) {
  const [mode, setMode] = useState<'search' | 'otp' | 'orders'>('search');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orderId, setOrderId] = useState(initialOrderId || '');
  const [requestId, setRequestId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<GuestOrderSummary[]>([]);
  const [buyerInfo, setBuyerInfo] = useState<{ email: string; phone: string; name: string } | null>(
    null,
  );
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(initialOrderId || null);

  // Check existing session token in sessionStorage on load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check query param if initialOrderId wasn't passed via props
    if (!orderId) {
      const urlParams = new URLSearchParams(window.location.search);
      const qOrderId = urlParams.get('orderId');
      if (qOrderId) {
        setOrderId(qOrderId);
        setExpandedOrderId(qOrderId);
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
        setOrders(data.orders || []);
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
      setMode('otp');
      setIsLoading(false);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
      setIsLoading(false);
    }
  };

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
      setOrders(ordersData.orders || []);
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
      setIsLoading(false);
    } catch {
      setError('เกิดข้อผิดพลาดในการขอรหัส OTP ใหม่');
      setIsLoading(false);
    }
  };

  // Sign out / Clear session
  const handleClearSession = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('ticket_guest_lookup_token');
    }
    setToken(null);
    setOrders([]);
    setBuyerInfo(null);
    setOtpCode('');
    setRequestId('');
    setMode('search');
    setError(null);
  };

  return (
    <div className="guest-lookup-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Search Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>
          ค้นหาบัตรคอนเสิร์ตของฉัน
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
          ตรวจสอบรายการคำสั่งซื้อ เปิดดูบัตรเข้างาน และแสดง QR Code สำหรับเข้างาน (ไม่ต้องสมัครสมาชิก)
        </p>
      </div>

      {/* Mode 1: Search Form */}
      {mode === 'search' && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          {orderId && (
            <div
              style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: '#1e40af',
              }}
            >
              <InfoIcon />
              <span>
                กำลังค้นหาคำสั่งซื้อ <strong>{orderId}</strong> — กรุณากรอกอีเมลและเบอร์โทรศัพท์ที่ใช้สั่งซื้อเพื่อยืนยันตัวตน
              </span>
            </div>
          )}

          {error && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: '#991b1b',
              }}
            >
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRequestOtp}>
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="lookup-email"
                style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}
              >
                อีเมลที่ใช้สั่งซื้อ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="lookup-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@mail.com"
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="lookup-phone"
                style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}
              >
                เบอร์โทรศัพท์ที่ใช้สั่งซื้อ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="lookup-phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0812345678"
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                backgroundColor: '#1848ed',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 20px',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              <SearchIcon />
              {isLoading ? 'กำลังตรวจสอบ...' : 'ขอรหัส OTP เพื่อเปิดดูบัตร'}
            </button>
          </form>

          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '16px', textAlign: 'center', lineHeight: 1.5 }}>
            * เพื่อความปลอดภัยของข้อมูล ระบบจะส่งรหัส OTP 6 หลักไปยังอีเมลเพื่อยืนยันตัวตนก่อนเปิดแสดงบัตรและ QR Code
          </p>
        </div>
      )}

      {/* Mode 2: OTP Verification Form */}
      {mode === 'otp' && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#eff6ff',
                color: '#1848ed',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              <ShieldCheckIcon />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 6px 0', color: '#0f172a' }}>
              ยืนยันรหัส OTP
            </h2>
            <p style={{ fontSize: '14px', color: '#475569', margin: 0 }}>
              ระบบได้ส่งรหัส OTP 6 หลักไปยังอีเมล <strong>{email}</strong> แล้ว
            </p>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              รหัสมีอายุการใช้งาน 5 นาที
            </p>
          </div>

          {error && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: '#991b1b',
              }}
            >
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleVerifyOtp}>
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <label
                htmlFor="lookup-otp-code"
                style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}
              >
                รหัส OTP 6 หลัก
              </label>
              <input
                id="lookup-otp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
                style={{
                  width: '200px',
                  padding: '12px 16px',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  letterSpacing: '8px',
                  textAlign: 'center',
                  borderRadius: '6px',
                  border: '2px solid #1848ed',
                  outline: 'none',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCode.length !== 6}
              style={{
                width: '100%',
                backgroundColor: '#1848ed',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 20px',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: isLoading || otpCode.length !== 6 ? 'not-allowed' : 'pointer',
                opacity: isLoading || otpCode.length !== 6 ? 0.6 : 1,
                marginBottom: '12px',
              }}
            >
              {isLoading ? 'กำลังยืนยัน...' : 'ยืนยันรหัส OTP'}
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
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
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0,
              }}
            >
              <ArrowLeftIcon /> แก้ไขอีเมลหรือเบอร์โทร
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={cooldownSeconds > 0 || isLoading}
              style={{
                background: 'none',
                border: 'none',
                color: cooldownSeconds > 0 ? '#94a3b8' : '#1848ed',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: cooldownSeconds > 0 || isLoading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0,
              }}
            >
              <RefreshIcon />
              {cooldownSeconds > 0 ? `ขอรหัสใหม่ได้ใน ${cooldownSeconds}s` : 'ขอรหัส OTP ใหม่'}
            </button>
          </div>
        </div>
      )}

      {/* Mode 3: Orders List View */}
      {mode === 'orders' && (
        <div>
          {/* Active session bar */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '14px 18px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
                ผู้ซื้อ: {buyerInfo?.name || 'ลูกค้า TICKET'}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                อีเมล: {buyerInfo?.email} · โทรศัพท์: {buyerInfo?.phone}
              </div>
            </div>

            <button
              type="button"
              onClick={handleClearSession}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              ออกจากระบบค้นหา
            </button>
          </div>

          {/* Orders list */}
          {orders.length === 0 ? (
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                padding: '40px 20px',
                textAlign: 'center',
              }}
            >
              <TicketIcon />
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginTop: '12px' }}>
                ไม่พบประวัติการสั่งซื้อสำหรับข้อมูลนี้
              </h3>
              <p style={{ color: '#64748b', fontSize: '14px' }}>
                ท่านสามารถตรวจสอบอีเมลหรือเบอร์โทรศัพท์ที่ใช้ในการสั่งซื้ออีกครั้ง
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {orders.map(order => {
                const isPaid = order.status === 'paid';
                const isExpanded = expandedOrderId === order.id || orders.length === 1;

                return (
                  <div
                    key={order.id}
                    id={`order-${order.id}`}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      border: expandedOrderId === order.id ? '2px solid #1848ed' : '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Order Header */}
                    <div
                      style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                        backgroundColor: '#fafafa',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '2px' }}>
                          รหัสคำสั่งซื้อ
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>
                          {order.id}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* Status Badge */}
                        {isPaid && (
                          <span
                            style={{
                              backgroundColor: '#dcfce7',
                              color: '#15803d',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <CheckCircleIcon /> ชำระเงินสำเร็จ
                          </span>
                        )}
                        {order.status === 'reserved' && (
                          <span
                            style={{
                              backgroundColor: '#fef9c3',
                              color: '#854d0e',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <ClockIcon /> รอชำระเงิน
                          </span>
                        )}
                        {order.status === 'expired' && (
                          <span
                            style={{
                              backgroundColor: '#f1f5f9',
                              color: '#64748b',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <AlertIcon /> หมดเวลาจอง
                          </span>
                        )}
                        {order.status === 'cancelled' && (
                          <span
                            style={{
                              backgroundColor: '#fee2e2',
                              color: '#b91c1c',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <AlertIcon /> ยกเลิกคำสั่งซื้อ
                          </span>
                        )}
                        {order.status === 'payment_exception' && (
                          <span
                            style={{
                              backgroundColor: '#fef3c7',
                              color: '#b45309',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <AlertIcon /> รอเจ้าหน้าที่ตรวจสอบ
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                          style={{
                            background: 'none',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: '#475569',
                            cursor: 'pointer',
                          }}
                        >
                          {isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                        </button>
                      </div>
                    </div>

                    {/* Order Main Content */}
                    <div style={{ padding: '20px' }}>
                      {/* Event Details */}
                      <div style={{ marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>
                          {order.eventTitle}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#475569' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPinIcon />
                            <span>{order.location}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CalendarIcon />
                            <span>
                              {formatDate(new Date(order.sessionStartTime))} เวลา {formatTime(new Date(order.sessionStartTime))} - {formatTime(new Date(order.sessionEndTime))}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Email Delivery Notice (AC-75 Lookup Recovery) */}
                      {isPaid && order.emailDelivery?.status === 'failed' && (
                        <div
                          style={{
                            backgroundColor: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: '6px',
                            padding: '12px 16px',
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '13px',
                            color: '#92400e',
                          }}
                        >
                          <AlertIcon />
                          <div>
                            <strong>ระบบส่งอีเมลไม่สำเร็จ:</strong> แต่บัตรของท่านออกสมบูรณ์แล้ว สามารถใช้ QR Code ด้านล่างนี้เพื่อแสดงต่อเจ้าหน้าที่เข้างานได้ทันที
                          </div>
                        </div>
                      )}

                      {/* Expanded Section: Tickets & Payment Breakdown */}
                      {isExpanded && (
                        <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                          {/* Tickets Section for Paid Orders */}
                          {isPaid && order.tickets.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                              <h4 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 12px 0' }}>
                                รายการบัตรเข้างาน ({order.tickets.length} ใบ)
                              </h4>
                              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
                                แต่ละใบมี QR Code เฉพาะแยกใบ กรุณาแสดง QR Code ต่อเจ้าหน้าที่ ณ จุดตรวจเข้างาน
                              </p>

                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                  gap: '16px',
                                }}
                              >
                                {order.tickets.map((ticket, idx) => (
                                  <div
                                    key={ticket.id}
                                    style={{
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '8px',
                                      padding: '16px',
                                      backgroundColor: '#ffffff',
                                      textAlign: 'center',
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: '12px',
                                        color: '#64748b',
                                        marginBottom: '6px',
                                      }}
                                    >
                                      <span>ใบที่ {idx + 1} จาก {order.tickets.length}</span>
                                      <span
                                        style={{
                                          color: ticket.admissionStatus === 'inside' ? '#15803d' : '#2563eb',
                                          fontWeight: 'bold',
                                        }}
                                      >
                                        {ticket.admissionStatus === 'inside' ? 'เข้างานแล้ว' : 'ยังไม่เข้างาน'}
                                      </span>
                                    </div>

                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1848ed', marginBottom: '2px' }}>
                                      {ticket.ticketTypeName}
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                                      ราคา {formatBaht(ticket.ticketPrice)}
                                    </div>

                                    {/* QR Code */}
                                    <div style={{ margin: '12px auto', width: '160px', height: '160px' }}>
                                      {/* biome-ignore lint/performance/noImgElement: QR code SVG rendering */}
                                      <img
                                        src={ticket.qrCodeUrl}
                                        alt={`QR Code บัตร ${ticket.ticketCode}`}
                                        width={160}
                                        height={160}
                                        style={{
                                          display: 'block',
                                          margin: '0 auto',
                                          borderRadius: '6px',
                                          border: '1px solid #cbd5e1',
                                        }}
                                      />
                                    </div>

                                    <div
                                      style={{
                                        fontFamily: 'monospace',
                                        fontSize: '13px',
                                        fontWeight: 'bold',
                                        color: '#0f172a',
                                        backgroundColor: '#f1f5f9',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        display: 'inline-block',
                                        marginTop: '4px',
                                      }}
                                    >
                                      {ticket.ticketCode}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Order Financial Breakdown */}
                          <div
                            style={{
                              backgroundColor: '#f8fafc',
                              borderRadius: '6px',
                              padding: '16px',
                              fontSize: '13px',
                            }}
                          >
                            <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 10px 0' }}>
                              สรุปยอดเงิน
                            </h4>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ color: '#475569' }}>ราคารวมบัตร</span>
                              <span style={{ fontWeight: 'bold' }}>{formatBaht(order.subtotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ color: '#475569' }}>ค่าบริการลูกค้า</span>
                              <span>{formatBaht(order.customerFee)}</span>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                borderTop: '1px solid #cbd5e1',
                                paddingTop: '8px',
                                marginTop: '8px',
                                fontSize: '15px',
                                fontWeight: 'bold',
                                color: '#0f172a',
                              }}
                            >
                              <span>ยอดชำระทั้งหมด</span>
                              <span style={{ color: '#1848ed' }}>{formatBaht(order.total)}</span>
                            </div>
                          </div>

                          {/* Action Links & Refund Entry Placeholder (TASK-021) */}
                          <div
                            style={{
                              marginTop: '16px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '12px',
                            }}
                          >
                            <a
                              href={`/events/${order.eventId}`}
                              style={{
                                fontSize: '13px',
                                color: '#1848ed',
                                textDecoration: 'none',
                                fontWeight: 'bold',
                              }}
                            >
                              ไปยังหน้ารายละเอียดคอนเสิร์ต &rarr;
                            </a>

                            {isPaid && (
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                <span style={{ marginRight: '8px' }}>ต้องการขอคืนเงิน?</span>
                                <a
                                  href="/refund-policy"
                                  style={{
                                    color: '#475569',
                                    textDecoration: 'underline',
                                  }}
                                >
                                  อ่านนโยบายและเงื่อนไขการขอคืนเงิน
                                </a>
                              </div>
                            )}
                          </div>

                          {/* Guest Order Refund Manager (TASK-021) */}
                          {isPaid && token && (
                            <GuestOrderRefundManager
                              orderId={order.id}
                              sessionToken={token}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
