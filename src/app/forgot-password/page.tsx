import { TicketIcon } from '@/components/ticket-icon';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <section className="opening account-page" aria-labelledby="forgot-title">
      <div className="opening-copy account-copy">
        <p className="eyebrow">TICKET / พื้นที่ทีมงาน</p>
        <h1 id="forgot-title">ลืมรหัสผ่านหลังบ้าน</h1>
        <p className="intro">ระบุอีเมลบัญชีของคุณเพื่อรับลิงก์สำหรับตั้งรหัสผ่านใหม่ทางอีเมล</p>
        <ForgotPasswordForm />
      </div>
      <div className="opening-mark" aria-hidden="true">
        <span className="vertical-word">BEHIND THE SHOW</span>
        <TicketIcon className="large-ticket" />
        <span className="mark-caption">TICKET</span>
      </div>
    </section>
  );
}
