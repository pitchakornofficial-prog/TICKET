import {
  BanknotesIcon,
  CalendarIcon,
  ClockIcon,
  MailIcon,
  PencilSquareIcon,
  QrCodeIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from './icons';

interface PurchaseTermsFaqListProps {
  title?: string;
}

export function PurchaseTermsFaqList({
  title = 'ข้อกำหนดและข้อชี้แจงในการซื้อบัตร',
}: PurchaseTermsFaqListProps) {
  return (
    <section className="purchase-terms-faq-section" aria-labelledby="purchase-terms-faq-heading" style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
        <ShieldCheckIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
        <h3 id="purchase-terms-faq-heading" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
          {title}
        </h3>
      </div>

      <div className="faq-list">
        {/* Card 1: 15-Minute Hold */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <ClockIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>1. ระยะเวลาการกันบัตรเพื่อชำระเงิน (15 นาที)</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              เมื่อยืนยันการเลือกบัตร ระบบจะทำการล็อกโควตาบัตรให้คุณเป็นเวลา 15 นาทีบริบูรณ์ โดยมีตัวเลขนับถอยหลังแสดงอยู่ด้านล่างหน้าจอ โปรดสแกนชำระเงินผ่าน PromptPay ให้เสร็จสิ้นภายในเวลาที่กำหนด หากหมดเวลา ระบบจะยกเลิกคำสั่งซื้อและปล่อยโควตาบัตรคืนสู่ระบบทันทีโดยไม่มีการต่อเวลาอัตโนมัติ
            </p>
          </div>
        </details>

        {/* Card 2: PromptPay Payment */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <BanknotesIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>2. การชำระเงินผ่านระบบ PromptPay QR</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              ระบบรองรับการสแกนชำระเงินผ่านแอปพลิเคชันของทุกธนาคารในประเทศไทยที่รองรับพร้อมเพย์ โดยผู้ซื้อต้องสแกนชำระด้วยยอดเงินที่ตรงตามจำนวนจริงเต็มบาทตามที่ระบุในคำสั่งซื้อ (รวมค่าบัตรและค่าบริการระบบ) เมื่อโอนเงินเสร็จสิ้น ระบบจะตรวจสอบและปรับสถานะคำสั่งซื้อเป็น &quot;ชำระเงินสำเร็จ&quot; โดยอัตโนมัติทันที
            </p>
          </div>
        </details>

        {/* Card 3: Digital Delivery & Lookup */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <MailIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>3. การรับบัตรคอนเสิร์ตดิจิทัลและการค้นหาบัตร</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              เมื่อชำระเงินสำเร็จ ระบบจะออกบัตรดิจิทัลพร้อม QR Code สำหรับสแกนเข้างานแยกใบตามจำนวนบัตรที่ซื้อ พร้อมส่งไปยังอีเมลของผู้ซื้อทันที ผู้ซื้อสามารถเปิดดู ดาวน์โหลด หรือตรวจสอบบัตรของตนเองได้ตลอดเวลาผ่านเมนู &quot;ค้นหาบัตรของฉัน&quot; บนเว็บไซต์ โดยใช้อีเมลและเบอร์โทรศัพท์ พร้อมยืนยันตัวตนด้วยรหัส OTP
            </p>
          </div>
        </details>

        {/* Card 4: Refund Policy 7 Days */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <RefreshIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>4. นโยบายการขอคืนเงินโดยผู้ซื้อ (เงื่อนไขล่วงหน้า 7 วัน)</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              ผู้ซื้อสามารถยื่นคำร้องขอคืนเงินสำหรับบัตรที่ยังไม่ได้ใช้งานได้ล่วงหน้า <strong>ไม่น้อยกว่า 168 ชั่วโมง (7 วันบริบูรณ์)</strong> ก่อนเวลาเริ่มต้นของรอบการแสดง หากเหลือน้อยกว่า 7 วัน ระบบจะปิดรับการขอคืนเงินทุกกรณี เว้นแต่งานคอนเสิร์ตมีการยกเลิกหรือเลื่อนการแสดง ทั้งนี้ยอดเงินที่จะได้รับคืนคือเฉพาะ <strong>ราคาบัตรเข้าชม (Ticket Price)</strong> ไม่รวมค่าบริการระบบและค่าธรรมเนียมธุรกรรม
            </p>
          </div>
        </details>

        {/* Card 5: Cancellation & Postponement */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <CalendarIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>5. กรณีงานคอนเสิร์ตยกเลิกหรือเลื่อนรอบการแสดง</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              <strong>กรณียกเลิกงาน:</strong> ระบบจะนำคำสั่งซื้อเข้าสู่คิวรอรับเงินคืนราคาบัตรเต็มจำนวนโดยอัตโนมัติ โดยผู้ซื้อไม่ต้องยื่นคำร้องแยกรายบุคคล และจะได้รับการประสานงานโอนเงินคืนเข้าบัญชี
            </p>
            <p style={{ marginTop: '0.5rem' }}>
              <strong>กรณีเลื่อนรอบการแสดง:</strong> บัตรเดิมจะยังคงมีผลสมบูรณ์สำหรับใช้เข้าชมในวันและเวลารอบใหม่ได้ทันที หากผู้ซื้อไม่สะดวกเข้าชมในรอบใหม่ ระบบจะเปิดช่วงเวลาพิเศษ (Special Refund Window) ให้ยื่นขอคืนเงินได้ตามระยะเวลาที่กำหนด
            </p>
          </div>
        </details>

        {/* Card 6: QR Code Security & Admission */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <QrCodeIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>6. ความปลอดภัยของ QR Code และกติกาการสแกนเข้างาน</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              QR Code บนบัตรแต่ละใบใช้สแกนผ่านประตูเข้างานได้เพียง <strong>1 ครั้ง</strong> เท่านั้น เมื่อสแกนแล้วสถานะจะเปลี่ยนเป็น &quot;เข้างานแล้ว&quot; ทันที โปรดเก็บรักษา QR Code เป็นความลับ ห้ามโพสต์ลงโซเชียลมีเดียเพื่อป้องกันการถูกสวมสิทธิ์ ทั้งนี้ บัตรทุกใบในคำสั่งซื้อใช้ข้อมูลผู้ซื้อชุดเดียวกัน ไม่จำเป็นต้องลงทะเบียนชื่อผู้เข้าชมแยกใบ สามารถส่งต่อ QR Code ให้เพื่อนร่วมชมใช้สแกนเข้างานได้
            </p>
          </div>
        </details>

        {/* Card 7: Buyer Info Correction */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <PencilSquareIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>7. การแก้ไขข้อมูลผู้ซื้อหลังการชำระเงิน</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              เพื่อความปลอดภัยและการป้องกันการทุจริต เมื่อคำสั่งซื้อชำระเงินสำเร็จแล้วจะไม่สามารถแก้ไขชื่อ อีเมล หรือเบอร์โทรศัพท์ด้วยตนเองผ่านหน้าเว็บไซต์ได้ หากพบว่าพิมพ์ข้อมูลผิดพลาด โปรดติดต่อเจ้าหน้าที่ผู้ดูแลระบบ (Owner) ผ่านหน้าติดต่อเรา พร้อมแสดงหลักฐานคำสั่งซื้อเพื่อขอตรวจสอบและดำเนินการแก้ไขข้อมูลให้ตามระเบียบ
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
