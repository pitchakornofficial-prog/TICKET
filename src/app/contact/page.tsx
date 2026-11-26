import type { Metadata } from 'next';
import Link from 'next/link';
import { ClockIcon, InfoIcon, MapPinIcon, PhoneIcon } from '@/components/icons';
import { FloatingBackToTop } from '@/components/floating-back-to-top';
import { getDatabasePool } from '@/server/database';
import { readPublicOwnerContactInfo } from '@/server/owner-contact-info';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'ติดต่อเรา — TICKET',
  description: 'ช่องทางติดต่อทีมงาน TICKET ฝ่ายสนับสนุนลูกค้าและผู้จัดงานคอนเสิร์ต',
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'ติดต่อเรา — TICKET',
    description: 'ช่องทางติดต่อทีมงาน TICKET ฝ่ายสนับสนุนลูกค้าและผู้จัดงานคอนเสิร์ต',
    url: '/contact',
    type: 'website',
  },
};

export default async function ContactPage() {
  const contact = await readPublicOwnerContactInfo(getDatabasePool());

  return (
    <article className="static-page" aria-labelledby="contact-title">
      <header className="static-header">
        <h1 id="contact-title">ติดต่อเรา</h1>
        <p className="intro">
          หากท่านมีข้อสงสัยเกี่ยวกับการซื้อบัตร การตรวจสอบคำสั่งซื้อ หรือสนใจนำคอนเสิร์ตมาร่วมเปิดจำหน่ายกับเรา
        </p>
      </header>

      <div className="contact-grid">
        <section className="contact-card">
          <div className="card-badge"><InfoIcon /> ฝ่ายบริการลูกค้าและช่องทางติดต่อหลัก</div>
          <h2>สอบถามเรื่องการซื้อบัตร / คำสั่งซื้อ</h2>
          <p>
            สำหรับผู้ซื้อบัตรที่ต้องการความช่วยเหลือในการรับบัตรทางอีเมล
            หรือต้องการขอตรวจสอบข้อมูลการชำระเงิน
          </p>
          <dl className="contact-details">
            <div>
              <dt>
                สายด่วน (Hotline)
                {contact.hotlineBadge ? ` · ${contact.hotlineBadge}` : ''}
              </dt>
              <dd>
                <strong>{contact.hotline}</strong>
                {contact.hotlineNote && (
                  <p className="note-text" style={{ marginTop: '0.25rem' }}>{contact.hotlineNote}</p>
                )}
              </dd>
            </div>
            <div>
              <dt>
                อีเมลติดต่อ
                {contact.emailBadge ? ` · ${contact.emailBadge}` : ''}
              </dt>
              <dd>
                <strong>{contact.email}</strong>
                {contact.emailNote && (
                  <p className="note-text" style={{ marginTop: '0.25rem' }}>{contact.emailNote}</p>
                )}
              </dd>
            </div>
            <div>
              <dt>
                LINE Official
                {contact.lineBadge ? ` · ${contact.lineBadge}` : ''}
              </dt>
              <dd>
                <strong>{contact.lineId}</strong>
                {contact.lineNote && (
                  <p className="note-text" style={{ marginTop: '0.25rem' }}>{contact.lineNote}</p>
                )}
              </dd>
            </div>
          </dl>
          <div className="note-box">
            <p className="note-text">
              <strong>คำแนะนำ:</strong> กรุณาเตรียมเลขอ้างอิงคำสั่งซื้อ และอีเมลที่ใช้สั่งซื้อเพื่อให้เจ้าหน้าที่ดำเนินการได้สะดวกรวดเร็วยิ่งขึ้น
              หรือตรวจดูบัตรด้วยตนเองที่หน้า <Link href="/my-tickets" className="text-link">ค้นหาบัตรของฉัน</Link>
            </p>
          </div>
        </section>

        <section className="contact-card">
          <div className="card-badge"><ClockIcon /> เวลาทำการและสำนักงาน (Organizers & Office)</div>
          <h2>เวลาให้บริการและร่วมงานกับ TICKET</h2>
          <p>
            ระบบ TICKET รองรับผู้จัดงานที่ได้รับคำเชิญจากเจ้าของระบบ (Owner Invitation)
            เพื่อเปิดจำหน่ายบัตรคอนเสิร์ตและใช้งานระบบสแกนบัตรหน้างาน
          </p>
          <dl className="contact-details">
            <div>
              <dt>เวลาทำการ</dt>
              <dd>
                <strong>{contact.operatingHours}</strong>
                {contact.operatingHoursNote && (
                  <p className="note-text" style={{ marginTop: '0.25rem' }}>{contact.operatingHoursNote}</p>
                )}
              </dd>
            </div>
            <div>
              <dt><MapPinIcon style={{ width: '14px', height: '14px', verticalAlign: '-2px', marginRight: '0.25rem' }} /> ที่ตั้งสำนักงาน</dt>
              <dd>
                <strong>{contact.address}</strong>
                {contact.addressNote && (
                  <p className="note-text" style={{ marginTop: '0.25rem' }}>{contact.addressNote}</p>
                )}
              </dd>
            </div>
            <div>
              <dt><PhoneIcon style={{ width: '14px', height: '14px', verticalAlign: '-2px', marginRight: '0.25rem' }} /> สำหรับผู้จัดงาน</dt>
              <dd>ส่งรายละเอียดงานคอนเสิร์ต วันเวลา สถานที่จัด และประมาณการจำนวนบัตรมาที่ {contact.email}</dd>
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
                นอกจากนี้ยังสามารถเข้าดูบัตรได้ผ่านหน้า <Link href="/my-tickets" className="text-link">ค้นหาบัตรของฉัน</Link> ด้วยอีเมลและเบอร์โทรศัพท์
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

      <FloatingBackToTop testId="contact-back-to-top-btn" />
    </article>
  );
}
