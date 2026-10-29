import Link from 'next/link';
import { AlertTriangleIcon } from '@/components/icons';

export const metadata = {
  title: 'อุปกรณ์ไม่ได้รับอนุญาต · TICKET',
};

export default async function ScannerAccessRejectedPage({
  searchParams,
}: {
  searchParams: Promise<{ scannerName?: string; eventId?: string }>;
}) {
  const params = await searchParams;
  const scannerName = params.scannerName || 'เจ้าหน้าที่สแกน';

  return (
    <div className="scanner-workspace-canvas">
      <div className="scanner-workspace-card terminal-centered-wrapper">
        <div
          className="form-card terminal-container"
          style={{ textAlign: 'center', padding: '2.5rem 1.75rem' }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#fef2f2',
              color: '#dc2626',
              marginBottom: '1.25rem',
            }}
          >
            <AlertTriangleIcon width={28} height={28} />
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.6rem' }}>
            ลิงก์นี้ถูกผูกใช้งานกับอุปกรณ์อื่นแล้ว
          </h2>

          <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: 1.6, margin: '0 auto 1.5rem', maxWidth: '420px' }}>
            สิทธิ์การเข้าใช้งานของ <strong>{scannerName}</strong> ถูกจำกัดให้เข้าใช้งานได้เพียง 1 อุปกรณ์เท่านั้น และได้มีอุปกรณ์เครื่องอื่นทำการผูกสิทธิ์เข้าใช้งานไปแล้ว
          </p>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '1rem',
              fontSize: '0.85rem',
              color: '#64748b',
              lineHeight: 1.5,
              marginBottom: '1.75rem',
              textAlign: 'left',
            }}
          >
            <strong style={{ color: '#0f172a', display: 'block', marginBottom: '0.35rem' }}>
              คำแนะนำสำหรับเจ้าหน้าที่:
            </strong>
            หากท่านจำเป็นต้องเปลี่ยนเครื่อง (เช่น โทรศัพท์เดิมแบตหมด ชำรุด หรือสูญหาย) กรุณาแจ้งผู้จัดงานคอนเสิร์ตให้กดปุ่ม <strong>[รีเซ็ตอุปกรณ์]</strong> ในหน้าจัดการทีมงาน เพื่อให้สามารถสแกนเข้าใช้งานบนเครื่องนี้ได้
          </div>

          <Link href="/" className="primary-button" style={{ display: 'inline-flex', minWidth: '160px', justifyContent: 'center' }}>
            <span>กลับไปหน้าหลัก</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
