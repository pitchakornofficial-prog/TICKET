import Link from 'next/link';
import { TicketIcon } from '@/components/ticket-icon';

export default function NotFound() {
  return (
    <main className="error-page-container" aria-labelledby="not-found-title">
      <div className="error-page-card">
        <div className="error-icon-wrap" aria-hidden="true">
          <TicketIcon style={{ width: '36px', height: '36px', color: 'var(--blue)' }} />
        </div>

        <div className="error-badge">
          <span>404 · ไม่พบหน้าเว็บ</span>
        </div>

        <h1 id="not-found-title" className="error-title">
          ไม่พบหน้าเว็บ หรือไม่มีสิทธิ์เข้าถึงเนื้อหา
        </h1>

        <p className="error-desc">
          หน้าเว็บที่ท่านต้องการเข้าชมอาจถูกย้าย ปิดให้บริการชั่วคราว หรือท่านอาจไม่มีสิทธิ์เข้าถึงเนื้อหานี้ กรุณาตรวจสอบที่อยู่เว็บไซต์ (URL) อีกครั้ง หรือกลับสู่หน้าแรก
        </p>

        <div className="error-actions">
          <Link href="/" className="primary-button button-link error-primary-btn">
            กลับสู่หน้าแรก
          </Link>
          <Link href="/contact" className="secondary-button button-link error-secondary-btn">
            ติดต่อสอบถาม
          </Link>
        </div>
      </div>
    </main>
  );
}
