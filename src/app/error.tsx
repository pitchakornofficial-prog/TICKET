'use client';

import Link from 'next/link';
import { AlertIcon } from '@/components/alert-icon';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="error-page-container" aria-labelledby="error-title">
      <div className="error-page-card">
        <div className="error-icon-wrap error-icon-alert" aria-hidden="true">
          <AlertIcon style={{ width: '36px', height: '36px', color: '#dc2626' }} />
        </div>

        <div className="error-badge error-badge-alert">
          <span>ระบบไม่สามารถประมวลผลคำขอได้</span>
        </div>

        <h1 id="error-title" className="error-title">
          เกิดข้อผิดพลาดในการโหลดข้อมูล
        </h1>

        <p className="error-desc">
          ระบบไม่สามารถดำเนินการตามคำขอของท่านได้ในขณะนี้ กรุณากดลองใหม่อีกครั้ง หรือกลับสู่หน้าแรก
        </p>

        <div className="error-actions">
          <button
            type="button"
            onClick={() => reset()}
            className="primary-button error-primary-btn"
          >
            ลองใหม่อีกครั้ง
          </button>
          <Link href="/" className="secondary-button button-link error-secondary-btn">
            กลับสู่หน้าแรก
          </Link>
        </div>
      </div>
    </main>
  );
}
