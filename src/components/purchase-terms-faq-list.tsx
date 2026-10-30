import {
  ClockIcon,
  CheckCircleIcon,
  InfoIcon,
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
              <span>ระยะเวลาล็อกบัตร 15 นาที</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              เมื่อกดยืนยันการเลือกบัตร ระบบจะล็อกโควตาบัตรให้คุณเป็นเวลา 15 นาที โปรดดำเนินการสแกนชำระเงินผ่าน PromptPay ภายในเวลาที่กำหนด
            </p>
          </div>
        </details>

        {/* Card 2: Digital Delivery */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <CheckCircleIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>การจัดส่งบัตรดิจิทัลทางอีเมล</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              เมื่อชำระเงินเรียบร้อย บัตรคอนเสิร์ตดิจิทัลพร้อม QR Code สำหรับเข้างานจะถูกส่งไปยังอีเมลที่ระบุ และสามารถเปิดดูได้จากเมนู &quot;ค้นหาบัตรของฉัน&quot;
            </p>
          </div>
        </details>

        {/* Card 3: Refund Policy */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <InfoIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>นโยบายการคืนเงินและยกเลิก</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              การซื้อบัตรถือเป็นที่สิ้นสุด ไม่สามารถขอคืนเงินหรือเปลี่ยนรอบได้ เว้นแต่กรณีที่งานคอนเสิร์ตมีการยกเลิกหรือเลื่อนวันแสดงตามประกาศของผู้จัดงาน
            </p>
          </div>
        </details>

        {/* Card 4: Security */}
        <details className="faq-item">
          <summary className="faq-question">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
              <ShieldCheckIcon style={{ width: '18px', height: '18px', color: 'var(--blue)', flexShrink: 0 }} />
              <span>ความปลอดภัยของ QR Code เข้างาน</span>
            </span>
          </summary>
          <div className="faq-answer">
            <p>
              QR Code บนบัตร 1 รหัสใช้เข้าชมงานได้เพียง 1 ครั้งเท่านั้น โปรดเก็บรักษาเป็นความลับและห้ามเผยแพร่สู่สาธารณะเพื่อป้องกันการสวมสิทธิ์
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
