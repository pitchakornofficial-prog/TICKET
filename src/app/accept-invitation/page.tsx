import { AcceptInvitationForm } from '@/components/accept-invitation-form';
import { getAuth } from '@/server/auth';
import { verifyInvitation } from '@/server/invitation';
import type { Pool } from 'pg';

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let valid = false;
  let email: string | undefined;
  let reason: string | undefined;

  if (token) {
    const auth = getAuth();
    const pool = auth.options.database as Pool;
    const check = await verifyInvitation(pool, token);
    valid = check.valid;
    email = check.email;
    reason = check.reason;
  }

  const errorMessages: Record<string, string> = {
    not_found: 'ไม่พบคำเชิญหรือลิงก์คำเชิญไม่ถูกต้อง',
    expired: 'ลิงก์คำเชิญนี้หมดอายุแล้ว (เกิน 48 ชั่วโมง) กรุณาติดต่อผู้ดูแลระบบเพื่อขอคำเชิญใหม่',
    used: 'คำเชิญนี้ถูกใช้งานแล้ว',
    replaced: 'คำเชิญนี้ถูกยกเลิกแล้วเนื่องจากมีการส่งคำเชิญใหม่',
  };

  return (
    <section className="opening account-page" aria-labelledby="invitation-title">
      <div className="opening-copy account-copy">
        <p className="eyebrow">TICKET / พื้นที่ทีมงาน</p>
        <h1 id="invitation-title">ตอบรับคำเชิญผู้จัดงาน</h1>
        {valid && token ? (
          <>
            <p className="intro">กรุณาระบุชื่อผู้จัดงานและรหัสผ่านสำหรับเข้าสู่ระบบ TICKET</p>
            <AcceptInvitationForm token={token} defaultEmail={email} />
          </>
        ) : (
          <div className="login-form">
            <p id="accept-error" className="form-error" role="alert">
              {reason ? errorMessages[reason] || 'ลิงก์คำเชิญไม่ถูกต้อง' : 'ไม่พบโทเค็นคำเชิญหรือลิงก์ไม่ถูกต้อง'}
            </p>
            <div className="login-links">
              <a href="/login" className="login-forgot">ไปหน้าเข้าสู่ระบบ</a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
