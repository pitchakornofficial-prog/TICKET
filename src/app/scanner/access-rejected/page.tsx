import Link from 'next/link';
import { AlertTriangleIcon } from '@/components/icons';

export const metadata = {
  title: 'อุปกรณ์ไม่ได้รับอนุญาต · TICKET',
};

function getRejectedCopy(reason: string | undefined, scannerName: string) {
  switch (reason) {
    case 'expired':
      return {
        title: 'ลิงก์เข้าใช้งานหมดอายุแล้ว',
        description: (
          <>
            ลิงก์เข้าใช้งานแบบใช้ครั้งเดียวของ <strong>{scannerName}</strong> หมดอายุแล้วเพื่อความปลอดภัย กรุณาขอให้ผู้จัดงานออกลิงก์ใหม่
          </>
        ),
        guidance: (
          <>
            กรุณาแจ้งผู้จัดงานคอนเสิร์ตให้กดปุ่ม <strong>[ออกลิงก์ / QR ใหม่]</strong> ในหน้าจัดการทีมงาน เพื่อรับลิงก์ชุดใหม่สำหรับเข้าใช้งาน
          </>
        ),
      };
    case 'revoked':
      return {
        title: 'ลิงก์เข้าใช้งานถูกยกเลิกแล้ว',
        description: (
          <>
            ลิงก์นี้ถูกเพิกถอนหรือถูกแทนที่ด้วยลิงก์ชุดใหม่แล้ว สิทธิ์ของ <strong>{scannerName}</strong> จึงไม่สามารถเปิดผ่านลิงก์เดิมได้
          </>
        ),
        guidance: (
          <>
            กรุณาใช้ลิงก์หรือ QR Code ล่าสุดที่ผู้จัดงานส่งให้ หรือแจ้งผู้จัดงานเพื่อออกลิงก์ใหม่ในหน้าจัดการทีมงาน
          </>
        ),
      };
    case 'used':
      return {
        title: 'ลิงก์นี้ถูกใช้งานไปแล้ว',
        description: (
          <>
            ลิงก์เข้าใช้งานแบบใช้ครั้งเดียวของ <strong>{scannerName}</strong> ถูกเปิดใช้งานไปแล้วและไม่สามารถนำกลับมาใช้ซ้ำได้อีก
          </>
        ),
        guidance: (
          <>
            หากท่านเป็นผู้ใช้งานบนเครื่องที่ลงทะเบียนไว้แล้วให้เปิดหน้า Terminal สแกนโดยตรง หรือหากต้องเปลี่ยนเครื่องหรือเปิดใช้งานใหม่ กรุณาแจ้งผู้จัดงานให้กดปุ่ม <strong>[รีเซ็ตอุปกรณ์]</strong> หรือออกลิงก์ใหม่
          </>
        ),
      };
    default:
      return {
        title: 'ลิงก์นี้ถูกผูกใช้งานกับอุปกรณ์อื่นแล้ว',
        description: (
          <>
            สิทธิ์การเข้าใช้งานของ <strong>{scannerName}</strong> ถูกจำกัดให้เข้าใช้งานได้เพียง 1 อุปกรณ์เท่านั้น และได้มีอุปกรณ์เครื่องอื่นทำการผูกสิทธิ์เข้าใช้งานไปแล้ว
          </>
        ),
        guidance: (
          <>
            หากท่านจำเป็นต้องเปลี่ยนเครื่อง (เช่น โทรศัพท์เดิมแบตหมด ชำรุด หรือสูญหาย) กรุณาแจ้งผู้จัดงานคอนเสิร์ตให้กดปุ่ม <strong>[รีเซ็ตอุปกรณ์]</strong> ในหน้าจัดการทีมงาน เพื่อให้สามารถสแกนเข้าใช้งานบนเครื่องนี้ได้
          </>
        ),
      };
  }
}

export default async function ScannerAccessRejectedPage({
  searchParams,
}: {
  searchParams: Promise<{ scannerName?: string; eventId?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const scannerName = params.scannerName || 'เจ้าหน้าที่สแกน';
  const copy = getRejectedCopy(params.reason, scannerName);

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
            {copy.title}
          </h2>

          <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: 1.6, margin: '0 auto 1.5rem', maxWidth: '420px' }}>
            {copy.description}
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
            {copy.guidance}
          </div>

          <Link href="/" className="primary-button" style={{ display: 'inline-flex', minWidth: '160px', justifyContent: 'center' }}>
            <span>กลับไปหน้าหลัก</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
