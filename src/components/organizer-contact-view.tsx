'use client';

import { useState, useEffect } from 'react';
import {
  PhoneIcon,
  MailIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CheckCircleIcon,
  CheckIcon,
  RefreshIcon,
} from '@/components/icons';
import { HeaderInfoTooltip } from './header-info-tooltip';
import { triggerRefreshToast } from './toast-notification';
import {
  EMPTY_OWNER_CONTACT_INFO,
  loadSharedOwnerContactInfo,
  EVENT_OWNER_CONTACT_CHANGED,
  type OwnerContactInfo,
} from '@/lib/owner-contact-sync';

export function OrganizerContactView() {
  const [contactInfo, setContactInfo] = useState<OwnerContactInfo>(EMPTY_OWNER_CONTACT_INFO);
  const [loadingContact, setLoadingContact] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [inquirySubject, setInquirySubject] = useState('');
  const [inquiryCategory, setInquiryCategory] = useState<'finance' | 'concert' | 'staff' | 'system'>('system');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [sendingInquiry, setSendingInquiry] = useState(false);
  const [inquirySuccess, setInquirySuccess] = useState('');
  const [inquiryError, setInquiryError] = useState('');

  const handleRefresh = () => {
    setRefreshing(true);
    loadSharedOwnerContactInfo()
      .then((info) => {
        setContactInfo(info);
        triggerRefreshToast('ติดต่อเจ้าของระบบ');
      })
      .catch(() => setToastMessage('โหลดข้อมูลติดต่อไม่สำเร็จ'))
      .finally(() => setRefreshing(false));
  };
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const handleUpdate = () => {
      loadSharedOwnerContactInfo()
        .then((info) => {
          if (active) setContactInfo(info);
        })
        .catch(() => {
          if (active) setToastMessage('โหลดข้อมูลติดต่อไม่สำเร็จ');
        })
        .finally(() => {
          if (active) setLoadingContact(false);
        });
    };
    handleUpdate();
    window.addEventListener(EVENT_OWNER_CONTACT_CHANGED, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      active = false;
      window.removeEventListener(EVENT_OWNER_CONTACT_CHANGED, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleSendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setInquiryError('');
    setInquirySuccess('');
    if (!inquirySubject.trim() || !inquiryMessage.trim()) {
      setInquiryError('กรุณากรอกหัวข้อและรายละเอียดข้อความให้ครบถ้วน');
      return;
    }

    setSendingInquiry(true);
    try {
      const res = await fetch('/api/organizer/contact-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: inquirySubject.trim(),
          category: inquiryCategory,
          message: inquiryMessage.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInquiryError(data.message || 'ส่งข้อความถึงผู้ดูแลระบบไม่สำเร็จ');
        return;
      }
      setInquirySuccess('ส่งข้อความและแจ้งเตือนไปยังผู้ดูแลระบบเรียบร้อยแล้ว');
      setInquirySubject('');
      setInquiryMessage('');
      setTimeout(() => setInquirySuccess(''), 5000);
    } catch {
      setInquiryError('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อส่งข้อความ');
    } finally {
      setSendingInquiry(false);
    }
  };

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
            <div className="organizer-header-title-row">
            <h1 className="contact-page-title">
              ติดต่อเจ้าของระบบ TICKET
              <HeaderInfoTooltip text="ช่องทางติดต่ออย่างเป็นทางการสำหรับผู้จัดงาน เพื่อประสานงาน แจ้งปัญหา หรือขอคำปรึกษาเร่งด่วนกับเจ้าของระบบ" />
            </h1>
            <button
              type="button"
              className="organizer-inline-refresh-btn"
              data-testid="contact-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="รีเฟรชข้อมูลติดต่อ"
              title="รีเฟรชข้อมูลติดต่อ"
            >
              <RefreshIcon className={`inline-refresh-icon ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
            <p className="contact-page-desc">
              ช่องทางติดต่ออย่างเป็นทางการสำหรับผู้จัดงานและผู้ว่าจ้าง เพื่อประสานงาน แจ้งปัญหา หรือขอคำปรึกษาเร่งด่วน
            </p>
          </div>
        </header>

        {/* Centered Single Column Layout for Official Contact Channels (D-209) */}
        <div className="contact-content-grid contact-centered-grid">
          <section className="contact-channels-column" aria-label="ช่องทางติดต่อทางการ">
            <div className="contact-section-card channels-card">
              <div className="channels-card-header">
                <div className="card-header-icon-wrap">
                  <PhoneIcon width={22} height={22} />
                </div>
                <div>
                  <h2 className="channels-card-title">ช่องทางการติดต่อทางการ</h2>
                  <p className="channels-card-subtitle">
                    ติดต่อเจ้าของระบบและฝ่ายดูแลผู้จัดงานได้โดยตรงผ่านช่องทางต่อไปนี้ (ข้อมูลซิงก์จากระบบส่วนกลาง)
                  </p>
                </div>
              </div>

              <div className="channels-list">
                {loadingContact ? (
                  <p className="loading-text">กำลังโหลดช่องทางติดต่อทางการ...</p>
                ) : (
                <>
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
                      {contactInfo.hotlineBadge && (
                        <span className="channel-badge badge-emergency">{contactInfo.hotlineBadge}</span>
                      )}
                    </div>
                    <span className="channel-value">{contactInfo.hotline || 'ยังไม่ได้ตั้งค่าเบอร์สายด่วน'}</span>
                    {contactInfo.hotlineNote && <p className="channel-subtext">{contactInfo.hotlineNote}</p>}
                    {contactInfo.hotline && (
                      <div className="channel-actions">
                        <a href={`tel:${contactInfo.hotline.split(',')[0].trim().replace(/-/g, '')}`} className="channel-action-btn btn-call">
                          โทรออก
                        </a>
                        <button
                          type="button"
                          className="channel-action-btn btn-copy"
                          onClick={() => handleCopy(contactInfo.hotline, 'hotline')}
                        >
                          {copiedKey === 'hotline' ? <CheckIcon width={14} height={14} /> : null}
                          <span>{copiedKey === 'hotline' ? 'คัดลอกแล้ว' : 'คัดลอกเบอร์'}</span>
                        </button>
                      </div>
                    )}
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
                      {contactInfo.emailBadge && (
                        <span className="channel-badge badge-info">{contactInfo.emailBadge}</span>
                      )}
                    </div>
                    <span className="channel-value">{contactInfo.email || 'ยังไม่ได้ตั้งค่าอีเมลติดต่อ'}</span>
                    {contactInfo.emailNote && <p className="channel-subtext">{contactInfo.emailNote}</p>}
                    {contactInfo.email && (
                      <div className="channel-actions">
                        <a href={`mailto:${contactInfo.email}`} className="channel-action-btn btn-mail">
                          ส่งอีเมล
                        </a>
                        <button
                          type="button"
                          className="channel-action-btn btn-copy"
                          onClick={() => handleCopy(contactInfo.email, 'email')}
                        >
                          {copiedKey === 'email' ? <CheckIcon width={14} height={14} /> : null}
                          <span>{copiedKey === 'email' ? 'คัดลอกแล้ว' : 'คัดลอกอีเมล'}</span>
                        </button>
                      </div>
                    )}
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
                      {contactInfo.lineBadge && (
                        <span className="channel-badge badge-line">{contactInfo.lineBadge}</span>
                      )}
                    </div>
                    <span className="channel-value">{contactInfo.lineId || 'ยังไม่ได้ตั้งค่า LINE Official'}</span>
                    {contactInfo.lineNote && <p className="channel-subtext">{contactInfo.lineNote}</p>}
                    {contactInfo.lineId && (
                      <div className="channel-actions">
                        <button
                          type="button"
                          className="channel-action-btn btn-copy"
                          onClick={() => handleCopy(contactInfo.lineId, 'line')}
                        >
                          {copiedKey === 'line' ? <CheckIcon width={14} height={14} /> : null}
                          <span>{copiedKey === 'line' ? 'คัดลอกแล้ว' : 'คัดลอก LINE ID'}</span>
                        </button>
                      </div>
                    )}
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
                    <span className="channel-value">{contactInfo.operatingHours || 'ยังไม่ได้ตั้งค่าเวลาทำการ'}</span>
                    {contactInfo.operatingHoursNote && <p className="channel-subtext">{contactInfo.operatingHoursNote}</p>}
                  </div>
                </div>

                {/* 5. Office Address (D-208) */}
                {contactInfo.address && (
                  <div className="channel-item office-address-item">
                    <div className="channel-icon-col">
                      <div className="channel-icon-pill hours">
                        <svg
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </div>
                    </div>
                    <div className="channel-info-col">
                      <div className="channel-name-row">
                        <span className="channel-name">ที่อยู่สำนักงานใหญ่ (Headquarters)</span>
                      </div>
                      <span className="channel-value" style={{ fontWeight: 400, fontSize: '0.92rem', lineHeight: '1.5' }}>
                        {contactInfo.address}
                      </span>
                      <p className="channel-subtext">{contactInfo.addressNote}</p>
                      <div className="channel-actions">
                        <button
                          type="button"
                          className="channel-action-btn btn-copy"
                          onClick={() => handleCopy(contactInfo.address, 'address')}
                        >
                          {copiedKey === 'address' ? <CheckIcon width={14} height={14} /> : null}
                          <span>{copiedKey === 'address' ? 'คัดลอกแล้ว' : 'คัดลอกที่อยู่'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                </>
                )}
              </div>
            </div>

            {/* Quick Inquiry Form Synced to Admin Notifications */}
            <div className="contact-section-card" style={{ marginTop: '1.25rem' }}>
              <div className="channels-card-header">
                <div className="card-header-icon-wrap">
                  <ChatBubbleLeftRightIcon width={22} height={22} />
                </div>
                <div>
                  <h2 className="channels-card-title">ส่งข้อความถึงผู้ดูแลระบบ</h2>
                  <p className="channels-card-subtitle">
                    ข้อความจะถูกซิงก์แจ้งเตือนไปยังหน้าผู้ดูแลระบบ (Admin) ทันทีเพื่อช่วยตรวจสอบและประสานงาน
                  </p>
                </div>
              </div>

              <form onSubmit={handleSendInquiry} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '1rem' }}>
                {inquirySuccess && (
                  <div className="status-banner success" role="status">
                    <CheckCircleIcon width={16} height={16} />
                    <span>{inquirySuccess}</span>
                  </div>
                )}
                {inquiryError && (
                  <div className="status-banner error" role="alert">
                    <span>{inquiryError}</span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px', gap: '0.75rem' }}>
                  <div>
                    <label htmlFor="support-inquiry-subject" className="form-label" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.86rem' }}>
                      หัวข้อเรื่อง *
                    </label>
                    <input
                      id="support-inquiry-subject"
                      type="text"
                      className="text-input"
                      placeholder="เช่น สอบถามรอบการโอนเงิน หรือแจ้งปัญหาหน้างาน"
                      value={inquirySubject}
                      onChange={(e) => setInquirySubject(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="support-inquiry-category" className="form-label" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.86rem' }}>
                      หมวดหมู่
                    </label>
                    <select
                      id="support-inquiry-category"
                      className="text-input"
                      value={inquiryCategory}
                      onChange={(e) => setInquiryCategory(e.target.value as 'finance' | 'concert' | 'staff' | 'system')}
                    >
                      <option value="system">ระบบทั่วไป</option>
                      <option value="concert">งานคอนเสิร์ต</option>
                      <option value="finance">การเงินและบัญชี</option>
                      <option value="staff">ทีมงานสแกน</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="support-inquiry-message" className="form-label" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.86rem' }}>
                    รายละเอียดข้อความ *
                  </label>
                  <textarea
                    id="support-inquiry-message"
                    rows={3}
                    className="text-input"
                    placeholder="ระบุรายละเอียดที่ต้องการให้ผู้ดูแลระบบตรวจสอบ..."
                    value={inquiryMessage}
                    onChange={(e) => setInquiryMessage(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    data-testid="support-inquiry-submit-btn"
                    className="settings-outline-btn-primary"
                    disabled={sendingInquiry}
                  >
                    {sendingInquiry ? 'กำลังส่งข้อความ...' : 'ส่งข้อความถึงผู้ดูแลระบบ'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
