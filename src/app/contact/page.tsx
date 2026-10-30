import Link from 'next/link';
import { ClockIcon, InfoIcon } from '@/components/icons';

export const metadata = {
  title: 'ติดต่อเรา — TICKET',
  description: 'ช่องทางติดต่อทีมงาน TICKET ฝ่ายสนับสนุนลูกค้าและผู้จัดงานคอนเสิร์ต',
};

export default function ContactPage() {
  return (
    <article className="static-page" aria-labelledby="contact-title">
      <header className="static-header">
        <p className="eyebrow">TICKET / ช่องทางติดต่อ</p>
        <h1 id="contact-title">ติดต่อเรา</h1>
        <p className="intro">
          หากท่านมีข้อสงสัยเกี่ยวกับการซื้อบัตร การตรวจสอบคำสั่งซื้อ หรือสนใจนำคอนเสิร์ตมาร่วมเปิดจำหน่ายกับเรา
        </p>
      </header>

      <div className="contact-grid">
        <section className="contact-card">
          <div className="card-badge"><InfoIcon /> ฝ่ายบริการลูกค้า (Guest Support)</div>
          <h2>สอบถามเรื่องการซื้อบัตร / คำสั่งซื้อ</h2>
          <p>
            สำหรับผู้ซื้อบัตรที่ต้องการความช่วยเหลือในการรับบัตรทางอีเมล
            หรือต้องการขอตรวจสอบข้อมูลการชำระเงิน
          </p>
          <dl className="contact-details">
            <div>
              <dt>อีเมลฝ่ายสนับสนุน</dt>
              <dd><strong>support@ticket.invalid</strong></dd>
            </div>
            <div>
              <dt>เวลาทำการ</dt>
              <dd>จันทร์ – ศุกร์ 09:00 – 18:00 น. (เวลาประเทศไทย Asia/Bangkok)</dd>
            </div>
            <div>
              <dt>การตอบกลับ</dt>
              <dd>เจ้าหน้าที่ตอบกลับภายใน 24 ชั่วโมงในวันทำการ</dd>
            </div>
          </dl>
          <div className="note-box">
            <p className="note-text">
              <strong>คำแนะนำ:</strong> กรุณาเตรียมเลขอ้างอิงคำสั่งซื้อ และอีเมลที่ใช้สั่งซื้อเพื่อให้เจ้าหน้าที่ดำเนินการได้สะดวกรวดเร็วยิ่งขึ้น
            </p>
          </div>
        </section>

        <section className="contact-card">
          <div className="card-badge"><ClockIcon /> สำหรับผู้จัดงาน (Organizers)</div>
          <h2>ร่วมงานและฝากจำหน่ายบัตร</h2>
          <p>
            ระบบ TICKET รองรับผู้จัดงานที่ได้รับคำเชิญจากเจ้าของระบบ (Owner Invitation)
            เพื่อเปิดจำหน่ายบัตรคอนเสิร์ตและใช้งานระบบสแกนบัตรหน้างาน
          </p>
          <dl className="contact-details">
            <div>
              <dt>อีเมลฝ่ายประสานงาน</dt>
              <dd><strong>organizer@ticket.invalid</strong></dd>
            </div>
            <div>
              <dt>เอกสารที่ต้องเตรียม</dt>
              <dd>รายละเอียดงานคอนเสิร์ต วันเวลา สถานที่จัด และประมาณการจำนวนบัตร</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="content-section faq-section">
        <h2>คำถามที่พบบ่อย (FAQ)</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary className="faq-question">ซื้อบัตรต้องสมัครสมาชิกหรือไม่?</summary>
            <div className="faq-answer">
              <p>
                ไม่ต้องสมัครสมาชิก ท่านสามารถเลือกซื้อบัตรโดยกรอกชื่อ อีเมล และเบอร์โทรศัพท์
                พร้อมยืนยันรหัส OTP ผ่านทางอีเมลได้ทันที
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">หลังชำระเงินจะได้รับบัตรอย่างไร?</summary>
            <div className="faq-answer">
              <p>
                เมื่อระบบตรวจพบการชำระเงินสำเร็จ ระบบจะจัดส่งบัตรเข้าทางอีเมลของท่านในรูปแบบ QR Code แยกใบตามจำนวนที่ซื้อ
                นอกจากนี้ยังสามารถเข้าดูบัตรได้ผ่านหน้าค้นหาคำสั่งซื้อด้วยอีเมลและเบอร์โทรศัพท์
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">หากต้องการขอคืนเงิน มีขั้นตอนอย่างไร?</summary>
            <div className="faq-answer">
              <p>
                ท่านสามารถยื่นคำร้องขอคืนเงินได้ล่วงหน้าไม่น้อยกว่า 7 วันก่อนวันจัดงานแสดง
                โดยศึกษารายละเอียดเงื่อนไขได้ที่ <Link href="/refund-policy" className="text-link">หน้านโยบายคืนเงิน</Link>
              </p>
            </div>
          </details>
        </div>
      </section>
    </article>
  );
}
