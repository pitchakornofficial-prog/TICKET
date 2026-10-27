'use client';

import { useState, useEffect } from 'react';
import {
  PhoneIcon,
  MailIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
  AlertTriangleIcon,
  CheckIcon,
} from '@/components/icons';

const TOPIC_CATEGORIES = [
  'ปัญหาการเงินและการจ่ายเงินรอบสัปดาห์',
  'คำขออนุมัติรอบการแสดงหรือการแก้ไขเร่งด่วน',
  'แจ้งปัญหาทางเทคนิคและระบบสแกนบัตรหน้างาน',
  'ขอความช่วยเหลือฉุกเฉินในวันจัดงานคอนเสิร์ต',
  'ข้อเสนอแนะและสอบถามทั่วไป',
];

const CONCERTS = [
  'Neon Nights World Tour in Bangkok 2026',
  'Summer Sound Festival 2027',
  'ไม่ระบุคอนเสิร์ตเฉพาะ',
];

export function OrganizerContactView() {
  const [topic, setTopic] = useState(TOPIC_CATEGORIES[0]);
  const [relatedConcert, setRelatedConcert] = useState(CONCERTS[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [contactPhone, setContactPhone] = useState('081-234-5678');
  const [contactEmail, setContactEmail] = useState('organizer@musicfest.co.th');

  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      showToast(`คัดลอก "${text}" เรียบร้อยแล้ว`);
      setTimeout(() => {
        setCopiedKey(null);
      }, 2500);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setFormError('กรุณากรอกหัวข้อเรื่องที่ต้องการติดต่อ');
      return;
    }
    if (!message.trim()) {
      setFormError('กรุณากรอกรายละเอียดข้อความ');
      return;
    }

    setFormError(null);
    setSubject('');
    setMessage('');
    showToast('ส่งข้อความตรงถึงเจ้าของระบบเรียบร้อยแล้ว เจ้าหน้าที่จะติดต่อกลับโดยเร็วที่สุด');
  };

  return (
    <div className="organizer-contact-page" data-testid="organizer-contact-view">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="organizer-contact-toast" role="status">
          <CheckCircleIcon width={18} height={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="contact-page-container">
        {/* Header Toolbar */}
        <header className="contact-page-header">
          <div className="contact-header-text">
            <h1 className="contact-page-title">ติดต่อเจ้าของระบบ TICKET</h1>
            <p className="contact-page-desc">
              ช่องทางติดต่ออย่างเป็นทางการสำหรับผู้จัดงานและผู้ว่าจ้าง เพื่อประสานงาน แจ้งปัญหา หรือขอคำปรึกษาเร่งด่วน
            </p>
          </div>
        </header>

        {/* Two-Column Grid Layout */}
        <div className="contact-content-grid">
          {/* Left Column: Official Contact Channels */}
          <section className="contact-channels-column" aria-label="ช่องทางติดต่อทางการ">
            <div className="contact-section-card channels-card">
              <div className="channels-card-header">
                <div className="card-header-icon-wrap">
                  <PhoneIcon width={22} height={22} />
                </div>
                <div>
                  <h2 className="channels-card-title">ช่องทางการติดต่อทางการ</h2>
                  <p className="channels-card-subtitle">
                    ติดต่อเจ้าของระบบและฝ่ายดูแลผู้จัดงานได้โดยตรงผ่านช่องทางต่อไปนี้
                  </p>
                </div>
              </div>

              <div className="channels-list">
                {/* 1. Emergency Hotline */}
                <div className="channel-item">
                  <div className="channel-icon-col">
                    <div className="channel-icon-pill hotline">
                      <PhoneIcon width={20} height={20} />
                    </div>
                  </div>
                  <div className="channel-info-col">
                    <div className="channel-name-row">
                      <span className="channel-name">สายด่วนผู้จัดงาน (Hotline)</span>
                      <span className="channel-badge badge-emergency">24 ชม. วันแสดงงาน</span>
                    </div>
                    <span className="channel-value">02-123-4567, 089-999-8888</span>
                    <p className="channel-subtext">สำหรับกรณีฉุกเฉิน ระบบหน้างาน และการสแกนบัตรขัดข้อง</p>
                    <div className="channel-actions">
                      <a href="tel:021234567" className="channel-action-btn btn-call">
                        โทรออก
                      </a>
                      <button
                        type="button"
                        className="channel-action-btn btn-copy"
                        onClick={() => handleCopy('02-123-4567', 'hotline')}
                      >
                        {copiedKey === 'hotline' ? <CheckIcon width={14} height={14} /> : null}
                        <span>{copiedKey === 'hotline' ? 'คัดลอกแล้ว' : 'คัดลอกเบอร์'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Official Email */}
                <div className="channel-item">
                  <div className="channel-icon-col">
                    <div className="channel-icon-pill email">
                      <MailIcon width={20} height={20} />
                    </div>
                  </div>
                  <div className="channel-info-col">
                    <div className="channel-name-row">
                      <span className="channel-name">อีเมลฝ่ายประสานงานผู้จัด</span>
                      <span className="channel-badge badge-info">ตอบใน 2-4 ชม.</span>
                    </div>
                    <span className="channel-value">organizer-support@ticket.co.th</span>
                    <p className="channel-subtext">ส่งเอกสารการเงิน บัญชีรับเงิน และคำขอแก้ไขงาน</p>
                    <div className="channel-actions">
                      <a href="mailto:organizer-support@ticket.co.th" className="channel-action-btn btn-mail">
                        ส่งอีเมล
                      </a>
                      <button
                        type="button"
                        className="channel-action-btn btn-copy"
                        onClick={() => handleCopy('organizer-support@ticket.co.th', 'email')}
                      >
                        {copiedKey === 'email' ? <CheckIcon width={14} height={14} /> : null}
                        <span>{copiedKey === 'email' ? 'คัดลอกแล้ว' : 'คัดลอกอีเมล'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. LINE Official */}
                <div className="channel-item">
                  <div className="channel-icon-col">
                    <div className="channel-icon-pill line">
                      <ChatBubbleLeftRightIcon width={20} height={20} />
                    </div>
                  </div>
                  <div className="channel-info-col">
                    <div className="channel-name-row">
                      <span className="channel-name">LINE Official Account</span>
                      <span className="channel-badge badge-line">แชทสะดวก</span>
                    </div>
                    <span className="channel-value">@ticket-organizer</span>
                    <p className="channel-subtext">พิมพ์พูดคุย สอบถามข้อมูล หรือแจ้งเตือนสถานะแบบเรียลไทม์</p>
                    <div className="channel-actions">
                      <button
                        type="button"
                        className="channel-action-btn btn-copy"
                        onClick={() => handleCopy('@ticket-organizer', 'line')}
                      >
                        {copiedKey === 'line' ? <CheckIcon width={14} height={14} /> : null}
                        <span>{copiedKey === 'line' ? 'คัดลอกแล้ว' : 'คัดลอก LINE ID'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. Operating Hours */}
                <div className="channel-item operating-hours-item">
                  <div className="channel-icon-col">
                    <div className="channel-icon-pill hours">
                      <ClockIcon width={20} height={20} />
                    </div>
                  </div>
                  <div className="channel-info-col">
                    <div className="channel-name-row">
                      <span className="channel-name">เวลาทำการของฝ่ายปฏิบัติการ</span>
                    </div>
                    <span className="channel-value">จันทร์ - ศุกร์ : 09:00 - 18:00 น.</span>
                    <p className="channel-subtext">
                      วันเสาร์ - อาทิตย์ และวันแสดงคอนเสิร์ต: มีเจ้าหน้าที่สแตนด์บายดูแลผ่านสายด่วนตลอดงาน
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Direct Message Form */}
          <section className="contact-form-column" aria-label="แบบฟอร์มส่งข้อความ">
            <div className="contact-section-card form-card">
              <div className="form-card-header">
                <div className="card-header-icon-wrap">
                  <PaperAirplaneIcon width={22} height={22} />
                </div>
                <div>
                  <h2 className="form-card-title">ส่งข้อความตรงถึงเจ้าของระบบ</h2>
                  <p className="form-card-subtitle">
                    ข้อความจะถูกส่งตรงไปยังระบบหลังบ้านของเจ้าของเพื่อดำเนินการและติดต่อกลับ
                  </p>
                </div>
              </div>

              {formError && (
                <div className="contact-form-error-banner" role="alert">
                  <AlertTriangleIcon width={18} height={18} />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="contact-direct-form">
                {/* 1. Topic Category & Concert */}
                <div className="form-row-two-col">
                  <div className="form-group-block">
                    <label htmlFor="contact-topic-select" className="contact-form-label">
                      ประเภทเรื่องที่ต้องการติดต่อ <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="contact-topic-select"
                      className="form-select-control"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                    >
                      {TOPIC_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group-block">
                    <label htmlFor="contact-concert-select" className="contact-form-label">
                      คอนเสิร์ตที่เกี่ยวข้อง
                    </label>
                    <select
                      id="contact-concert-select"
                      className="form-select-control"
                      value={relatedConcert}
                      onChange={(e) => setRelatedConcert(e.target.value)}
                    >
                      {CONCERTS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 2. Subject */}
                <div className="form-group-block">
                  <label htmlFor="contact-subject-input" className="contact-form-label">
                    หัวข้อเรื่อง <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="contact-subject-input"
                    type="text"
                    className="form-input-text"
                    placeholder="เช่น ขอปรึกษาการตั้งค่ารอบการแสดงเพิ่มเติมสำหรับงาน Neon Nights"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                {/* 3. Message Body */}
                <div className="form-group-block">
                  <label htmlFor="contact-message-textarea" className="contact-form-label">
                    รายละเอียดข้อความ <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="contact-message-textarea"
                    rows={6}
                    className="form-textarea-control"
                    placeholder="ระบุรายละเอียดของปัญหา คำขอ หรือข้อมูลที่ต้องการให้เจ้าของระบบตรวจสอบ..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                {/* 4. Contact Back Details */}
                <div className="form-row-two-col">
                  <div className="form-group-block">
                    <label htmlFor="contact-phone-input" className="contact-form-label">
                      เบอร์โทรศัพท์สำหรับติดต่อกลับ
                    </label>
                    <input
                      id="contact-phone-input"
                      type="tel"
                      className="form-input-text"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>

                  <div className="form-group-block">
                    <label htmlFor="contact-email-input" className="contact-form-label">
                      อีเมลสำหรับติดต่อกลับ
                    </label>
                    <input
                      id="contact-email-input"
                      type="email"
                      className="form-input-text"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>
                </div>

                {/* Submit Action */}
                <div className="contact-form-footer">
                  <button type="submit" className="contact-submit-btn">
                    <PaperAirplaneIcon width={16} height={16} />
                    <span>ส่งข้อความถึงเจ้าของระบบ</span>
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>

      {/* Floating Back to Top Button */}
      {showScrollTop && (
        <button
          type="button"
          className="settings-floating-top-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="เลื่อนขึ้นบนสุด"
          title="เลื่อนขึ้นบนสุด"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </div>
  );
}
