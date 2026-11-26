'use client';

import { useEffect, useCallback } from 'react';
import { ShieldCheckIcon, XMarkIcon } from './icons';

interface PdpaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PdpaModal({ isOpen, onClose }: PdpaModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdpa-modal-title"
      data-testid="pdpa-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '1rem',
      }}
      tabIndex={-1}
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div
        data-testid="pdpa-modal-card"
        style={{
          background: 'var(--white, #ffffff)',
          borderRadius: '20px',
          maxWidth: '640px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          animation: 'fadeInModal 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ShieldCheckIcon style={{ width: '20px', height: '20px' }} />
            </div>
            <div>
              <h2
                id="pdpa-modal-title"
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 500,
                  color: '#0f172a',
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                นโยบายความเป็นส่วนตัว (PDPA)
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                การคุ้มครองข้อมูลส่วนบุคคลสำหรับผู้ซื้อบัตรบนระบบ TICKET
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              color: '#64748b',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <XMarkIcon style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            fontSize: '0.9rem',
            lineHeight: 1.65,
            color: '#334155',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <section>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.4rem' }}>
              1. ข้อมูลส่วนบุคคลที่เราจัดเก็บ
            </h3>
            <p style={{ margin: 0 }}>
              เพื่อให้บริการจำหน่ายบัตรคอนเสิร์ตโดยไม่ต้องบังคับสมัครสมาชิก เราจัดเก็บเฉพาะข้อมูลที่จำเป็นต่อการทำรายการ ได้แก่ ชื่อ-นามสกุล, ที่อยู่อีเมล, หมายเลขโทรศัพท์, ข้อมูลรอบการแสดง, และบันทึกประวัติการส่งรหัส OTP
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.4rem' }}>
              2. วัตถุประสงค์ในการประมวลผลข้อมูล
            </h3>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <li>จัดส่งรหัสผ่านครั้งเดียว (OTP) ทางอีเมลเพื่อยืนยันตัวตนก่อนการสั่งซื้อ</li>
              <li>ประมวลผลการกันโควตาบัตรและออกบัตรดิจิทัล QR Code หลังชำระเงินสำเร็จ</li>
              <li>ตรวจสอบสิทธิ์การเข้าชมการแสดง ณ จุดตรวจหน้างาน</li>
              <li>อำนวยความสะดวกในการค้นหาและเปิดดูบัตรย้อนหลังผ่านระบบตรวจสอบคำสั่งซื้อ</li>
              <li>ประสานงานและโอนเงินคืนกรณีคอนเสิร์ตยกเลิกหรือได้รับอนุมัติคืนเงิน</li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.4rem' }}>
              3. มาตรการจำกัดสิทธิ์การเข้าถึง (Least Privilege)
            </h3>
            <p style={{ margin: 0 }}>
              ระบบถูกออกแบบตามหลักสิทธิ์ขั้นต่ำอย่างเคร่งครัด โดยผู้จัดงาน (Organizers) และทีมงานสแกนบัตร (Scanners) จะไม่สามารถดึงข้อมูลติดต่อส่วนบุคคล เช่น เบอร์โทรศัพท์ หรืออีเมลเต็มของผู้ซื้อไปใช้ประโยชน์อื่นได้ (Masked Contact Data)
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.4rem' }}>
              4. สิทธิ์ของเจ้าของข้อมูลส่วนบุคคล
            </h3>
            <p style={{ margin: 0 }}>
              ท่านมีสิทธิ์ตรวจสอบประวัติคำสั่งซื้อและบัตรของตนเองผ่านระบบค้นหาคำสั่งซื้อ และมีสิทธิ์ขอแก้ไขข้อมูลติดต่อที่คลาดเคลื่อนโดยติดต่อเจ้าหน้าที่ผู้ดูแลระบบ TICKET
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.4rem' }}>
              5. ความมั่นคงปลอดภัยของข้อมูล
            </h3>
            <p style={{ margin: 0 }}>
              ข้อมูลทั้งหมดได้รับการจัดเก็บในฐานข้อมูลที่มีการควบคุมการเข้าถึงอย่างรัดกุม การรับส่งข้อมูลผ่านเครือข่ายใช้การเข้ารหัสมาตรฐาน TLS/HTTPS ความปลอดภัยสูง
            </p>
          </section>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#ffffff',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="primary-button"
            style={{
              padding: '0.65rem 1.5rem',
              borderRadius: '9999px',
              fontSize: '0.9rem',
              fontWeight: 400,
              cursor: 'pointer',
            }}
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
