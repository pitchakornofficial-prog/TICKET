'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

const TOTAL_QUEUE_COUNT = 36;

export function QueueWaitingRoom({
  eventId,
  eventTitle,
  eventLocation,
}: QueueWaitingRoomProps) {
  const router = useRouter();
  const [queueNumber] = useState(() => {
    const num = Math.floor(100 + Math.random() * 899);
    return `A-${num}`;
  });
  const [peopleAhead, setPeopleAhead] = useState(TOTAL_QUEUE_COUNT);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (peopleAhead <= 0) {
      setIsReady(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          `ticket_queue_pass_${eventId}`,
          JSON.stringify({
            queueNumber,
            passedAt: new Date().toISOString(),
          }),
        );
      }
      const redirectTimer = setTimeout(() => {
        router.push(`/events/${eventId}/checkout`);
      }, 1500);
      return () => clearTimeout(redirectTimer);
    }

    const interval = setInterval(() => {
      setPeopleAhead(prev => Math.max(0, prev - 1));
    }, 2000);

    return () => clearInterval(interval);
  }, [peopleAhead, eventId, queueNumber, router]);

  const handleProceedNow = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(
        `ticket_queue_pass_${eventId}`,
        JSON.stringify({
          queueNumber,
          passedAt: new Date().toISOString(),
        }),
      );
    }
    router.push(`/events/${eventId}/checkout`);
  };

  const progressPercent = Math.min(
    100,
    Math.round(((TOTAL_QUEUE_COUNT - peopleAhead) / TOTAL_QUEUE_COUNT) * 100),
  );

  const totalSeconds = peopleAhead * 2;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const estimatedTimeText = isReady
    ? 'พร้อมทันที'
    : minutes > 0
      ? `~${minutes} นาที ${remainingSeconds > 0 ? `${remainingSeconds} วินาที` : ''}`
      : `~${remainingSeconds} วินาที`;

  return (
    <div className="event-detail-page">
      <nav className="detail-breadcrumb" aria-label="ย้อนกลับ">
        <Link href={`/events/${eventId}`} className="back-link">
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
                <CheckCircleIcon /> ถึงคิวของคุณแล้ว พร้อมเข้าสู่หน้าจองบัตร
              </span>
            ) : (
              <span className="queue-active-badge" id="queue-waiting-badge">
                <ClockIcon /> ระบบกำลังจัดลำดับคิวเข้าซื้อบัตร
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
              <strong className="queue-metric-value highlight" id="queue-number-display">
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
              <span>สถานะการเลื่อนคิว</span>
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
                ระบบช่วยจัดระเบียบการเข้าจองบัตรเพื่อความยุติธรรม เมื่อถึงคิวของคุณแล้ว ระบบจะพาท่านเข้าสู่หน้าเลือกรอบและระบุจำนวนบัตรโดยอัตโนมัติ (มีเวลากันบัตร 15 นาทีหลังยืนยันการเลือก)
              </p>
            </div>
          </div>

          {/* Action Button */}
          <div className="queue-actions">
            <button
              id="proceed-to-checkout-btn"
              type="button"
              onClick={handleProceedNow}
              className="primary-button"
              style={{ width: '100%', fontSize: '1.05rem', fontWeight: 600 }}
            >
              {isReady
                ? 'เข้าสู่หน้าเลือกบัตรและกรอกข้อมูลทันที'
                : 'ข้ามคิวเข้าสู่หน้าเลือกบัตร (พร้อมใช้งาน)'}
            </button>

            <div className="queue-security-footer">
              <span>
                <ShieldCheckIcon /> ป้องกันบอทและล็อกโควตาแบบ Atomic Transaction
              </span>
              <span>
                <UsersIcon /> จำกัดการซื้อสูงสุดตามกติกาของงาน
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
