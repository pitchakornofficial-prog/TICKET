import { TicketIcon } from '@/components/ticket-icon';
import { ResetPasswordForm } from '@/components/reset-password-form';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <section className="opening account-page" aria-labelledby="reset-title">
      <div className="opening-copy account-copy">
        <p className="eyebrow">TICKET / พื้นที่ทีมงาน</p>
        <h1 id="reset-title">ตั้งรหัสผ่านใหม่</h1>
        {token ? (
          <>
            <p className="intro">กรุณากำหนดรหัสผ่านใหม่ที่มีความยาวอย่างน้อย 15 ตัวอักษร</p>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <div className="login-form">
            <p className="form-error" role="alert">
              ไม่พบโทเค็นสำหรับการตั้งรหัสผ่านใหม่หรือลิงก์ไม่ถูกต้อง
            </p>
            <div className="login-links">
              <a href="/forgot-password">ขอลิงก์ตั้งรหัสผ่านใหม่</a>
            </div>
          </div>
        )}
      </div>
      <div className="opening-mark" aria-hidden="true">
        <span className="vertical-word">BEHIND THE SHOW</span>
        <TicketIcon className="large-ticket" />
        <span className="mark-caption">TICKET</span>
      </div>
    </section>
  );
}
