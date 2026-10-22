import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth, readActor } from '@/server/auth';
import { roleHome } from '@/lib/back-office-access';
import { LoginForm } from '@/components/login-form';

export default async function LoginPage() {
  const actor = await readActor(getAuth(), await headers());
  if (actor) redirect(roleHome(actor.role));
  return (
    <section className="opening account-page" aria-labelledby="login-title">
      <div className="opening-copy account-copy">
        <p className="eyebrow">TICKET / พื้นที่ทีมงาน</p>
        <h1 id="login-title">เข้าสู่ระบบหลังบ้าน</h1>
        <p className="intro">สำหรับเจ้าของเว็บ ผู้จัดงาน และทีมสแกนบัตร<br />ใช้อีเมลและรหัสผ่านของบัญชีที่ได้รับสิทธิ์</p>
        <LoginForm />
        <p className="account-note">ลูกค้าซื้อบัตรได้โดยไม่ต้องสมัครสมาชิก</p>
      </div>
    </section>
  );
}
