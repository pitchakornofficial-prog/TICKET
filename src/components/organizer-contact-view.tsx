'use client';

import { useState, useEffect } from 'react';
import {
  PhoneIcon,
  MailIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CheckCircleIcon,
  CheckIcon,
} from '@/components/icons';
import { HeaderInfoTooltip } from './header-info-tooltip';
import {
  EMPTY_OWNER_CONTACT_INFO,
  loadSharedOwnerContactInfo,
  EVENT_OWNER_CONTACT_CHANGED,
  type OwnerContactInfo,
} from '@/lib/owner-contact-sync';

export function OrganizerContactView() {
  const [contactInfo, setContactInfo] = useState<OwnerContactInfo>(EMPTY_OWNER_CONTACT_INFO);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      loadSharedOwnerContactInfo().then(setContactInfo).catch(() => setToastMessage('โหลดข้อมูลติดต่อไม่สำเร็จ'));
    };
    handleUpdate();
    window.addEventListener(EVENT_OWNER_CONTACT_CHANGED, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(EVENT_OWNER_CONTACT_CHANGED, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
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
            <h1 className="contact-page-title">
              ติดต่อเจ้าของระบบ TICKET
              <HeaderInfoTooltip text="ช่องทางติดต่ออย่างเป็นทางการสำหรับผู้จัดงาน เพื่อประสานงาน แจ้งปัญหา หรือขอคำปรึกษาเร่งด่วนกับเจ้าของระบบ" />
            </h1>
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
                    <span className="channel-value">{contactInfo.hotline}</span>
                    <p className="channel-subtext">{contactInfo.hotlineNote}</p>
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
                    <span className="channel-value">{contactInfo.email}</span>
                    <p className="channel-subtext">{contactInfo.emailNote}</p>
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
                    <span className="channel-value">{contactInfo.lineId}</span>
                    <p className="channel-subtext">{contactInfo.lineNote}</p>
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
                    <span className="channel-value">{contactInfo.operatingHours}</span>
                    <p className="channel-subtext">{contactInfo.operatingHoursNote}</p>
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
                      <span className="channel-value" style={{ fontWeight: 500, fontSize: '0.92rem', lineHeight: '1.5' }}>
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
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
