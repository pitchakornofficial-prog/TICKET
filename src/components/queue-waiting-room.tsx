'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { startAdaptivePoller } from '@/lib/adaptive-polling';
import { PurchaseStepIndicator } from './purchase-step-indicator';
import {
  ClockIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
  InfoIcon,
  UsersIcon,
} from './icons';

interface QueueWaitingRoomProps {
  eventId: string;
  eventTitle: string;
  eventLocation: string;
}


function getDeterministicQueueNumber(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  const num = 100 + Math.abs(hash % 899);
  return `A-${num}`;
}

export function QueueWaitingRoom({
  eventId,
  eventTitle,
  eventLocation,
}: QueueWaitingRoomProps) {
  const router = useRouter();
  const [queueNumber, setQueueNumber] = useState(() => getDeterministicQueueNumber(eventId));
  const [peopleAhead, setPeopleAhead] = useState(0);
  const [totalQueueCount, setTotalQueueCount] = useState(1);
  const [isReady, setIsReady] = useState(false);
  const isRedirectingRef = useRef(false);

  useEffect(() => {
    // Generate or restore client queue number safely after hydration to avoid SSR mismatch
    try {
      const savedPass = sessionStorage.getItem(`ticket_queue_pass_${eventId}`);
      if (savedPass) {
        const parsed = JSON.parse(savedPass);
        if (parsed.queueNumber) {
          setQueueNumber(parsed.queueNumber);
          return;
        }
      }
      const randomNum = `A-${Math.floor(100 + Math.random() * 899)}`;
      setQueueNumber(randomNum);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [eventId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Direct back navigation prevention: pressing back navigates directly to event details and replaces queue entry
    const handlePopState = () => {
      window.location.replace(`/events/${eventId}`);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.replace(`/events/${eventId}`);
      }
    };

    window.history.pushState({ inQueue: true }, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [eventId]);

  useEffect(() => {
    // Clear any stale checkout deadline from previous sessions when entering queue
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`ticket_checkout_deadline_${eventId}`);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [eventId]);

  // Query queue status from server or process admission with adaptive polling, jitter, and backoff (D-271)
  useEffect(() => {
    let isMounted = true;

    const stopPolling = startAdaptivePoller({
      baseIntervalMs: 3000,
      minIntervalMs: 2000,
      maxIntervalMs: 15000,
      hiddenIntervalMs: 12000,
      jitterRatio: 0.2,
      step: async ({ signal }) => {
        try {
          const savedToken = typeof window !== 'undefined'
            ? sessionStorage.getItem(`ticket_queue_token_${eventId}`)
            : null;
          const res = await fetch(`/api/events/${eventId}/queue/status?token=${savedToken || ''}`, {
            signal,
          });
          if (res.status === 503) {
            // Keep polling with exponential backoff when server queue is temporarily busy instead of bypassing queue
            return { backoff: true };
          }
          if (!res.ok) throw new Error('Queue status API error');
          const data = await res.json();

          if (!isMounted || signal.aborted) return { stop: true };

          if (data.token && typeof window !== 'undefined') {
            sessionStorage.setItem(`ticket_queue_token_${eventId}`, data.token);
          }

          if (data.queueNumber) {
            setQueueNumber(`A-${data.queueNumber}`);
          }

          if (data.allowed) {
            // Within 200 users: granted direct admission
            setPeopleAhead(0);
            setIsReady(true);
            return { stop: true };
          }

          // Person 201 onwards: in waiting queue; scale interval smoothly by queue depth
          const ahead = Math.max(0, data.peopleAhead ?? 1);
          setPeopleAhead(ahead);
          setTotalQueueCount(prev => Math.max(prev, ahead));

          const adaptiveDelayMs =
            ahead > 200 ? 8000 : ahead > 50 ? 5000 : 3000;
          return { nextDelayMs: adaptiveDelayMs };
        } catch {
          // A network failure cannot grant admission. Keep the server token and
          // retry with backoff until the server explicitly allows checkout.
          if (!isMounted || signal.aborted) return { stop: true };
          return { backoff: true };
        }
      },
    });

    return () => {
      isMounted = false;
      stopPolling();
    };
  }, [eventId]);

  // Redirect only after explicit admission from the server (D-271)
  useEffect(() => {
    if (peopleAhead <= 0 && isReady) {
      if (isRedirectingRef.current) return;
      isRedirectingRef.current = true;

      if (typeof window !== 'undefined') {
        const nowIso = new Date().toISOString();
        const freshDeadline = Date.now() + 15 * 60 * 1000;
        sessionStorage.setItem(
          `ticket_queue_pass_${eventId}`,
          JSON.stringify({
            queueNumber,
            passedAt: nowIso,
          }),
        );
        sessionStorage.setItem(`ticket_checkout_deadline_${eventId}`, freshDeadline.toString());
      }

      // Auto-redirect automatically to checkout without needing manual click (D-271)
      const redirectTimer = setTimeout(() => {
        router.push(`/events/${eventId}/checkout`);
      }, 1000);
      return () => clearTimeout(redirectTimer);
    }

  }, [peopleAhead, isReady, eventId, queueNumber, router]);

  const handleProceedNow = () => {
    if (!isReady) {
      // D-273: Only explicit server admission unlocks checkout.
      return;
    }
    if (typeof window !== 'undefined') {
      const nowIso = new Date().toISOString();
      const freshDeadline = Date.now() + 15 * 60 * 1000;
      sessionStorage.setItem(
        `ticket_queue_pass_${eventId}`,
        JSON.stringify({
          queueNumber,
          passedAt: nowIso,
        }),
      );
      sessionStorage.setItem(`ticket_checkout_deadline_${eventId}`, freshDeadline.toString());
    }
    router.push(`/events/${eventId}/checkout`);
  };

  const progressPercent = isReady
    ? 100
    : Math.min(
        99,
        Math.max(5, Math.round(((totalQueueCount - peopleAhead) / totalQueueCount) * 100)),
      );

  const totalSeconds = peopleAhead * 2;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const estimatedTimeText = isReady
    ? 'พร้อมทันที'
    : peopleAhead <= 0
      ? 'รอสิทธิ์เข้าซื้อ'
      : minutes > 0
      ? `~${minutes} นาที ${remainingSeconds > 0 ? `${remainingSeconds} วินาที` : ''}`
      : `~${remainingSeconds} วินาที`;

  return (
    <div className="event-detail-page">
      <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
        <Link href={`/events/${eventId}`} replace className="back-link">
          <ArrowLeftIcon /> ย้อนกลับไปหน้ารายละเอียดคอนเสิร์ต
        </Link>
      </nav>

      <PurchaseStepIndicator currentStep="queue" eventId={eventId} />

      <div style={{ width: '100%', margin: '2rem 0' }}>
        <section
          className="queue-waiting-card"
          aria-labelledby="queue-heading"
          data-testid="queue-waiting-card"
        >
          <div className="queue-status-pill-wrap">
            {isReady ? (
              <span className="status-badge available-badge" id="queue-ready-badge">
                <CheckCircleIcon /> ถึงคิวของคุณแล้ว ระบบกำลังพาเข้าสู่หน้าซื้อบัตรอัตโนมัติ
              </span>
            ) : (
              <span className="queue-active-badge" id="queue-waiting-badge">
                <ClockIcon /> ระบบกำลังจัดลำดับคิวเข้าซื้อบัตร (คนที่ 201 ขึ้นไป)
              </span>
            )}
          </div>

          <h1 id="queue-heading" className="queue-event-title">
            {eventTitle}
          </h1>
          <p className="queue-event-sub">{eventLocation}</p>

          {/* Queue Metrics Grid */}
          <div className="queue-metrics-grid">
            <div className="queue-metric-box">
              <span className="queue-metric-label">หมายเลขคิวของคุณ</span>
              <strong
                className="queue-metric-value highlight"
                id="queue-number-display"
                suppressHydrationWarning
              >
                {queueNumber}
              </strong>
            </div>

            <div className="queue-metric-box">
              <span className="queue-metric-label">คิวก่อนหน้า</span>
              <strong className="queue-metric-value" id="queue-ahead-count">
                {peopleAhead} <small style={{ fontSize: '0.9rem', fontWeight: 500 }}>คิว</small>
              </strong>
            </div>

            <div className="queue-metric-box">
              <span className="queue-metric-label">เวลารอโดยประมาณ</span>
              <strong className="queue-metric-value">
                {estimatedTimeText}
              </strong>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="queue-progress-section">
            <div className="queue-progress-header">
              <span>{isReady ? 'ถึงคิวของคุณแล้ว' : 'สถานะการเลื่อนคิว'}</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div
              className="queue-progress-track"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="queue-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Preparation Checklist during waiting (D-36) */}
          <div className="queue-preparation-card">
            <h3 className="queue-prep-title">
              <InfoIcon style={{ width: '20px', height: '20px', color: 'var(--blue)' }} />
              ข้อแนะนำและการเตรียมตัวระหว่างรอคิว
            </h3>
            <div className="queue-prep-list">
              <div className="queue-prep-item">
                <div className="queue-prep-num">1</div>
                <div>
                  <strong>เตรียมอีเมลและเบอร์โทรศัพท์ที่ใช้งานได้จริง</strong>
                  <p>ระบบจะส่งรหัส OTP ทางอีเมลเพื่อยืนยันตัวตนก่อนเข้าสู่ขั้นตอนชำระเงิน กรุณาตรวจสอบว่าท่านสามารถเข้าถึงกล่องจดหมายได้ทันที</p>
                </div>
              </div>

              <div className="queue-prep-item">
                <div className="queue-prep-num">2</div>
                <div>
                  <strong>เตรียมแอปพลิเคชัน Mobile Banking</strong>
                  <p>หลังจากยืนยันจำนวนบัตรแล้ว ท่านจะมีเวลากันบัตร 15 นาทีเพื่อสแกนชำระผ่าน PromptPay QR Code กรุณาเตรียมแอปธนาคารให้พร้อม</p>
                </div>
              </div>

              <div className="queue-prep-item queue-prep-warning">
                <div className="queue-prep-num queue-prep-num-warning">!</div>
                <div>
                  <strong className="queue-prep-warning-title">กรุณาอย่าปิดหรือรีเฟรชหน้าจอนี้</strong>
                  <p className="queue-prep-warning-desc">ระบบกำลังรักษาสิทธิ์ลำดับคิวของท่านอย่างปลอดภัย การรีเฟรชหรือปิดหน้าต่างเบราว์เซอร์อาจทำให้ท่านหลุดจากคิวและต้องเริ่มต่อคิวใหม่</p>
                </div>
              </div>
            </div>
          </div>

          {/* Explanation Notice */}
          <div className="queue-info-notice">
            <InfoIcon />
            <div>
              <strong>คำแนะนำระหว่างจัดลำดับคิว</strong>
              <p>
                ระบบจำกัดสิทธิ์เข้าทำรายการพร้อมกัน 200 ท่านแรกเพื่อความเสถียร เมื่อถึงคิวของคุณแล้ว ระบบจะพาท่านเข้าสู่หน้าเลือกซื้อบัตรโดยอัตโนมัติโดยไม่ต้องคลิกปุ่มใด ๆ (มีเวลากันบัตร 15 นาที)
              </p>
            </div>
          </div>

          {/* Action Button (D-273: Lockout bypassing while waiting in queue) */}
          <div className="queue-actions">
            {isReady ? (
              <button
                id="proceed-to-checkout-btn"
                type="button"
                onClick={handleProceedNow}
                className="primary-button"
                style={{ width: '100%', fontSize: '1.05rem', fontWeight: 600 }}
              >
                เข้าสู่หน้าเลือกบัตรและกรอกข้อมูลทันที
              </button>
            ) : (
              <button
                id="proceed-to-checkout-btn"
                type="button"
                disabled
                className="secondary-button"
                style={{
                  width: '100%',
                  fontSize: '1rem',
                  fontWeight: 600,
                  opacity: 0.65,
                  cursor: 'not-allowed',
                  background: 'var(--card-bg, #f8fafc)',
                  color: 'var(--muted, #64748b)',
                  border: '1px solid var(--line, #e2e8f0)',
                }}
              >
                กรุณารอตามลำดับคิว (ระบบจะพาเข้าสู่หน้าซื้อบัตรอัตโนมัติเมื่อถึงคิว)
              </button>
            )}

            <div className="queue-security-footer">
              <span>
                <ShieldCheckIcon /> ป้องกันการลัดคิวและล็อกโควตาแบบ Atomic Transaction
              </span>
              <span>
                <UsersIcon /> จำกัดสิทธิ์เข้าทำรายการ 200 คนพร้อมกัน
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
