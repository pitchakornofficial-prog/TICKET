import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuth, readActor } from '@/server/auth';
import { roleHome } from '@/lib/back-office-access';
import { LoginForm } from '@/components/login-form';
import { ArrowLeftIcon, ShieldCheckIcon } from '@/components/icons';

export default async function LoginPage() {
  const actor = await readActor(getAuth(), await headers());
  if (actor) redirect(roleHome(actor.role));
  return (
    <section className="opening account-page login-page-section" aria-labelledby="login-title">
      <div className="login-card-container">
        <div className="login-portal-card">
          <div className="login-card-header">
            <div className="login-badge-pill">
              <ShieldCheckIcon className="login-badge-icon" />
              <p className="eyebrow login-eyebrow">TICKET / พื้นที่ทีมงาน</p>
            </div>
            <h1 id="login-title" className="login-card-title">เข้าสู่ระบบหลังบ้าน</h1>
            <p className="login-card-subtitle">
              สำหรับผู้ดูแลระบบ ผู้จัดงาน และทีมงานสแกนบัตร<br />
              เข้าถึงระบบจัดการด้วยบัญชีที่ได้รับอนุญาต
            </p>
          </div>

          <LoginForm />

          <div className="login-card-footer">
            <p className="login-public-note">สำหรับผู้ชมทั่วไป สามารถเลือกซื้อบัตรได้ทันทีโดยไม่ต้องเข้าสู่ระบบ</p>
            <Link href="/" className="login-back-home-link">
              <ArrowLeftIcon />
              <span>กลับสู่หน้าหลักคอนเสิร์ต</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
