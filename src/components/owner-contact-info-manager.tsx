'use client';

import { useState } from 'react';
import { PhoneIcon, MailIcon, ChatBubbleLeftRightIcon, ClockIcon, CheckCircleIcon } from './icons';
import { Button } from './ui';
import {
  loadOwnerContactInfo,
  saveOwnerContactInfo,
  resetOwnerContactInfo,
  type OwnerContactInfo,
} from '@/lib/owner-contact-sync';

export function OwnerContactInfoManager() {
  const [info, setInfo] = useState<OwnerContactInfo>(() => loadOwnerContactInfo());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveOwnerContactInfo(info);
    setSuccessMessage('บันทึกข้อมูลติดต่อเจ้าของระบบเรียบร้อยแล้ว ข้อมูลจะอัปเดตไปยังหน้าติดต่อของผู้จัดงานทันที');
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  const handleReset = () => {
    const confirmed = window.confirm('คุณต้องการรีเซ็ตข้อมูลติดต่อกลับเป็นค่าเริ่มต้นของระบบใช่หรือไม่?');
    if (!confirmed) return;
    const defaultData = resetOwnerContactInfo();
    setInfo(defaultData);
    setSuccessMessage('รีเซ็ตข้อมูลติดต่อกลับเป็นค่าเริ่มต้นเรียบร้อยแล้ว');
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  return (
    <section
      id="owner-contact-info-manager"
      className="form-card owner-contact-info-section"
      aria-labelledby="owner-contact-heading"
      data-testid="owner-contact-info-manager"
    >
      <div className="section-header-row">
        <div>
          <h2 id="owner-contact-heading">จัดการข้อมูลติดต่อเจ้าของระบบ (Owner Contact Info)</h2>
          <p className="card-caption">
            แก้ไขข้อมูลช่องทางการติดต่อทางการที่แสดงบนหน้าจอของผู้จัดงาน (เบอร์สายด่วน, อีเมล, LINE ID, เวลาทำการ และที่อยู่สำนักงาน)
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="status-banner success" role="status" style={{ marginBottom: '1.25rem' }}>
          <CheckCircleIcon />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="owner-contact-form">
        {/* 1. Hotline Section */}
        <div className="owner-form-card-subgroup">
          <div className="subgroup-title-row">
            <PhoneIcon width={18} height={18} />
            <h3 className="subgroup-heading">สายด่วนผู้จัดงาน (Hotline)</h3>
          </div>
          <div className="form-grid-two-col">
            <div className="form-group">
              <label htmlFor="owner-contact-hotline">เบอร์โทรสายด่วน</label>
              <input
                id="owner-contact-hotline"
                type="text"
                className="text-input"
                placeholder="เช่น 02-123-4567, 089-999-8888"
                value={info.hotline}
                onChange={e => setInfo({ ...info, hotline: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="owner-contact-hotline-badge">ป้ายกำกับสายด่วน</label>
              <input
                id="owner-contact-hotline-badge"
                type="text"
                className="text-input"
                placeholder="เช่น 24 ชม. วันแสดงงาน"
                value={info.hotlineBadge}
                onChange={e => setInfo({ ...info, hotlineBadge: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="owner-contact-hotline-note">คำอธิบายสายด่วน</label>
            <input
              id="owner-contact-hotline-note"
              type="text"
              className="text-input"
              placeholder="เช่น สำหรับกรณีฉุกเฉิน ระบบหน้างาน และการสแกนบัตรขัดข้อง"
              value={info.hotlineNote}
              onChange={e => setInfo({ ...info, hotlineNote: e.target.value })}
            />
          </div>
        </div>

        {/* 2. Official Email Section */}
        <div className="owner-form-card-subgroup">
          <div className="subgroup-title-row">
            <MailIcon width={18} height={18} />
            <h3 className="subgroup-heading">อีเมลฝ่ายประสานงานผู้จัด (Official Email)</h3>
          </div>
          <div className="form-grid-two-col">
            <div className="form-group">
              <label htmlFor="owner-contact-email">อีเมลฝ่ายประสานงาน</label>
              <input
                id="owner-contact-email"
                type="email"
                className="text-input"
                placeholder="เช่น organizer-support@ticket.co.th"
                value={info.email}
                onChange={e => setInfo({ ...info, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="owner-contact-email-badge">ป้ายกำกับอีเมล</label>
              <input
                id="owner-contact-email-badge"
                type="text"
                className="text-input"
                placeholder="เช่น ตอบใน 2-4 ชม."
                value={info.emailBadge}
                onChange={e => setInfo({ ...info, emailBadge: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="owner-contact-email-note">คำอธิบายอีเมล</label>
            <input
              id="owner-contact-email-note"
              type="text"
              className="text-input"
              placeholder="เช่น ส่งเอกสารการเงิน บัญชีรับเงิน และคำขอแก้ไขงาน"
              value={info.emailNote}
              onChange={e => setInfo({ ...info, emailNote: e.target.value })}
            />
          </div>
        </div>

        {/* 3. LINE Official Section */}
        <div className="owner-form-card-subgroup">
          <div className="subgroup-title-row">
            <ChatBubbleLeftRightIcon width={18} height={18} />
            <h3 className="subgroup-heading">LINE Official Account</h3>
          </div>
          <div className="form-grid-two-col">
            <div className="form-group">
              <label htmlFor="owner-contact-line">LINE ID</label>
              <input
                id="owner-contact-line"
                type="text"
                className="text-input"
                placeholder="เช่น @ticket-organizer"
                value={info.lineId}
                onChange={e => setInfo({ ...info, lineId: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="owner-contact-line-badge">ป้ายกำกับ LINE</label>
              <input
                id="owner-contact-line-badge"
                type="text"
                className="text-input"
                placeholder="เช่น แชทสะดวก"
                value={info.lineBadge}
                onChange={e => setInfo({ ...info, lineBadge: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="owner-contact-line-note">คำอธิบาย LINE</label>
            <input
              id="owner-contact-line-note"
              type="text"
              className="text-input"
              placeholder="เช่น พิมพ์พูดคุย สอบถามข้อมูล หรือแจ้งเตือนสถานะแบบเรียลไทม์"
              value={info.lineNote}
              onChange={e => setInfo({ ...info, lineNote: e.target.value })}
            />
          </div>
        </div>

        {/* 4. Operating Hours Section */}
        <div className="owner-form-card-subgroup">
          <div className="subgroup-title-row">
            <ClockIcon width={18} height={18} />
            <h3 className="subgroup-heading">เวลาทำการของฝ่ายปฏิบัติการ (Operating Hours)</h3>
          </div>
          <div className="form-group">
            <label htmlFor="owner-contact-hours">เวลาทำการ</label>
            <input
              id="owner-contact-hours"
              type="text"
              className="text-input"
              placeholder="เช่น จันทร์ - ศุกร์ : 09:00 - 18:00 น."
              value={info.operatingHours}
              onChange={e => setInfo({ ...info, operatingHours: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="owner-contact-hours-note">คำอธิบายเวลาทำการ</label>
            <input
              id="owner-contact-hours-note"
              type="text"
              className="text-input"
              placeholder="เช่น วันเสาร์ - อาทิตย์ และวันแสดงคอนเสิร์ต: มีเจ้าหน้าที่สแตนด์บายดูแลผ่านสายด่วนตลอดงาน"
              value={info.operatingHoursNote}
              onChange={e => setInfo({ ...info, operatingHoursNote: e.target.value })}
            />
          </div>
        </div>

        {/* 5. Office Address Section */}
        <div className="owner-form-card-subgroup">
          <div className="subgroup-title-row">
            <h3 className="subgroup-heading">ที่อยู่สำนักงานใหญ่ (Office Address)</h3>
          </div>
          <div className="form-group">
            <label htmlFor="owner-contact-address">ที่อยู่สำนักงาน</label>
            <textarea
              id="owner-contact-address"
              rows={3}
              className="text-input"
              placeholder="ระบุที่อยู่สำนักงานใหญ่..."
              value={info.address}
              onChange={e => setInfo({ ...info, address: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="owner-contact-address-note">คำอธิบายที่อยู่</label>
            <input
              id="owner-contact-address-note"
              type="text"
              className="text-input"
              placeholder="เช่น สำนักงานใหญ่ (ติดต่อทางไปรษณีย์หรือนัดหมายล่วงหน้า)"
              value={info.addressNote}
              onChange={e => setInfo({ ...info, addressNote: e.target.value })}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="owner-form-actions-bar" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={handleReset}
          >
            รีเซ็ตเป็นค่าเริ่มต้น
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
          >
            บันทึกข้อมูลติดต่อ
          </Button>
        </div>
      </form>
    </section>
  );
}
