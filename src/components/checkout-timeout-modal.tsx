'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClockIcon } from './icons';

interface CheckoutTimeoutModalProps {
  eventId: string;
  isOpen: boolean;
  onRedirect?: () => void;
}

export function CheckoutTimeoutModal({ eventId, isOpen, onRedirect }: CheckoutTimeoutModalProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  const handleRedirect = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`ticket_checkout_deadline_${eventId}`);
      sessionStorage.removeItem(`ticket_active_order_${eventId}`);
    }
    if (onRedirect) {
      onRedirect();
    } else {
      router.push(`/events/${eventId}?expired=true`);
    }
  }, [eventId, onRedirect, router]);

  // Reset countdown to 5 whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setCountdown(5);
    }
  }, [isOpen]);

  // Pure countdown timer decrement without side effects
  useEffect(() => {
    if (!isOpen || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, countdown]);

  // Safely trigger redirect during the effect phase once countdown reaches 0
  useEffect(() => {
    if (!isOpen || countdown !== 0) return;
    handleRedirect();
  }, [isOpen, countdown, handleRedirect]);

  if (!isOpen) return null;

  return (
    <div
      className="timeout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeout-modal-title"
    >
      <div className="timeout-modal-card">
        <div className="timeout-modal-icon-wrap" aria-hidden="true">
          <ClockIcon style={{ width: '36px', height: '36px', color: '#dc2626' }} />
        </div>

        <h2 id="timeout-modal-title" className="timeout-modal-title">
          หมดเวลาทำรายการ 15 นาที
        </h2>

        <p className="timeout-modal-desc">
          เนื่องจากหมดเวลาทำรายการ ระบบได้ทำการคืนโควตาบัตรกลับสู่ระบบเรียบร้อยแล้ว เพื่อให้ผู้ชมท่านอื่นสามารถเลือกซื้อได้ หากต้องการซื้อบัตร กรุณาเริ่มทำรายการใหม่อีกครั้ง
        </p>

        <div className="timeout-countdown-note">
          กำลังพาท่านกลับสู่หน้ารายละเอียดคอนเสิร์ตในอีก <strong>{countdown}</strong> วินาที...
        </div>

        <button
          id="timeout-modal-redirect-btn"
          type="button"
          onClick={handleRedirect}
          className="primary-button timeout-modal-action-btn"
        >
          กลับไปหน้ารายละเอียดคอนเสิร์ต
        </button>
      </div>
    </div>
  );
}
