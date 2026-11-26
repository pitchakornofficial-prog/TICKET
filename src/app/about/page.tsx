import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheckIcon, CheckCircleIcon, InfoIcon } from '@/components/icons';
import { FloatingBackToTop } from '@/components/floating-back-to-top';
import { getDatabasePool } from '@/server/database';
import { readPublicOwnerContactInfo } from '@/server/owner-contact-info';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'เกี่ยวกับเรา — TICKET',
  description: 'TICKET แพลตฟอร์มจำหน่ายบัตรคอนเสิร์ตในประเทศไทย ซื้อบัตรได้โดยไม่สมัครสมาชิก',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'เกี่ยวกับเรา — TICKET',
    description: 'TICKET แพลตฟอร์มจำหน่ายบัตรคอนเสิร์ตในประเทศไทย ซื้อบัตรได้โดยไม่สมัครสมาชิก',
    url: '/about',
    type: 'website',
  },
};

export default async function AboutPage() {
  const contact = await readPublicOwnerContactInfo(getDatabasePool());

  return (
    <article className="static-page" aria-labelledby="about-title">
      <header className="static-header">
        <h1 id="about-title">เวทีที่คุณรัก ดนตรีที่คุณรอคอย</h1>
        <p className="intro">
          TICKET คือแพลตฟอร์มจำหน่ายบัตรคอนเสิร์ตและงานแสดงดนตรีในประเทศไทย
          ที่ออกแบบขึ้นเพื่อส่งมอบประสบการณ์ที่โปร่งใส ซื่อตรง และสะดวกที่สุดแก่ผู้ชมทุกคน
        </p>
      </header>

      <section className="content-section">
        <h2>เจตนารมณ์ของเรา</h2>
        <p>
          เราเชื่อว่าดนตรีสดคือช่วงเวลาแห่งความทรงจำที่ไม่ควรถูกปิดกั้นด้วยความยุ่งยาก
          TICKET จึงถูกสร้างขึ้นภายใต้แนวคิดที่ให้ความสำคัญกับความสะดวกของผู้ชมเป็นอันดับแรก
          ลดขั้นตอนที่ซับซ้อน และให้ข้อมูลที่ชัดเจน ตรงไปตรงมา
        </p>

        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon"><CheckCircleIcon /></div>
            <h3>ซื้อง่าย ไม่ต้องสมัครสมาชิก</h3>
            <p>
              ผู้ชมสามารถเลือกซื้อบัตรได้ทันทีเพียงใช้อีเมลและเบอร์โทรศัพท์
              พร้อมยืนยันความปลอดภัยผ่านระบบรหัสผ่านครั้งเดียว (OTP) โดยไม่จำเป็นต้องสร้างบัญชีผู้ใช้
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><ShieldCheckIcon /></div>
            <h3>โปร่งใส ปลอดภัย ตรวจสอบได้</h3>
            <p>
              ระบบการกันบัตรที่มีกำหนดเวลาชัดเจน 15 นาที ชำระเงินผ่านระบบ QR Code รายคำสั่งซื้อที่ยืนยันผลอัตโนมัติ
              และออกบัตรดิจิทัลแยกใบเป็นรายบุคคล
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><InfoIcon /></div>
            <h3>นโยบายชัดเจน คุ้มครองผู้ชม</h3>
            <p>
              มีข้อกำหนดการขอคืนเงิน การเลื่อนรอบการแสดง และการยกเลิกงานที่ระบุไว้อย่างโปร่งใส
              เพื่อให้ผู้ชมมั่นใจได้ในทุกการสั่งซื้อ
            </p>
          </div>
        </div>
      </section>

      <section className="content-section">
        <h2>สำหรับผู้จัดงาน (Organizers)</h2>
        <p>
          TICKET เปิดรับผู้จัดงานคอนเสิร์ตและงานแสดงดนตรีที่ต้องการระบบฝากขายบัตรที่เสถียรและไว้วางใจได้
          เรามีระบบจัดการงานแสดง รอบการแสดง บัตรยืนและบัตรประเภทต่างๆ พร้อมระบบสแกนบัตรหน้างาน
          และการรายงานสรุปยอดขายที่รวดเร็วและแม่นยำ
        </p>
        <div className="action-box">
          <p>สนใจนำคอนเสิร์ตมาเปิดจำหน่ายบนระบบ TICKET?</p>
          <Link href="/contact" className="secondary-button button-link">ติดต่อทีมงานเพื่อขอคำเชิญ</Link>
        </div>
      </section>

      <section className="content-section">
        <h2>ติดต่อเรา</h2>
        <p>
          ทีมงาน TICKET พร้อมให้ความช่วยเหลือและตอบข้อซักถามเกี่ยวกับการซื้อบัตรและบริการ:
        </p>
        <ul className="info-list">
          <li><strong>สายด่วน:</strong> {contact.hotline}</li>
          <li><strong>อีเมลสนับสนุน:</strong> {contact.email}</li>
          <li><strong>LINE Official:</strong> {contact.lineId}</li>
          <li><strong>เวลาทำการ:</strong> {contact.operatingHours} (เวลาประเทศไทย Asia/Bangkok)</li>
          <li><strong>รายละเอียดเพิ่มเติม:</strong> ดูได้ที่หน้า <Link href="/contact" className="text-link">ติดต่อเรา</Link></li>
        </ul>
      </section>

      <FloatingBackToTop testId="about-back-to-top-btn" />
    </article>
  );
}
