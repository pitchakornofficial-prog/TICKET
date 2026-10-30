# ADR-0003: Omise, Resend และ Cloudflare R2

- Status: accepted
- Date: 2026-10-19
- Updated: 2026-10-30 — ผู้ใช้ยืนยันแนวทางลดต้นทุนและเตรียม production providers
- Source: ผู้ใช้ยืนยัน T4, T5, T6; payment flow P10=B และ manual refund R4=A
- Related: [domain money flows](../../CONTEXT.md), [requirements](../requirement.md)

## Context

ต้องมี payment QR รายคำสั่งซื้อพร้อมผลยืนยันอัตโนมัติ อีเมล OTP/บัตร
และไฟล์ภาพ/หลักฐานที่ทุกเครื่องเว็บใช้งานร่วมกันได้ ผู้ใช้ยืนยันผู้ให้บริการจากข้อเสนอแล้ว
ไม่ใช่การสมัครบัญชีหรืออนุญาตให้เรียกเก็บเงิน

## Decision

- Omise PromptPay: รับชำระด้วย QR รายคำสั่งซื้อ รับ webhook และตรวจผลกับผู้ให้บริการ
- Resend: ส่ง OTP อีเมล บัตร และลิงก์คำสั่งซื้อ
- Cloudflare R2: เก็บรูปและไฟล์หลักฐานแยกจากเครื่องเว็บ การเลือก AWS ไม่ได้เปลี่ยน R2 เป็น S3
- คง manual transfer สำหรับ refund และ organizer payout ตาม domain rules

## Provider evidence and readiness

เอกสาร Omise ที่ตรวจใน grill-workflow รองรับ `expires_at` และ `charge.complete`;
PromptPay refund ผ่าน Omise ไม่ได้ จึงสอดคล้องกับวิธีโอนคืนเองที่ผู้ใช้ยืนยัน
การจับคู่เวลาหมดอายุ QR กับ reservation และการประมวลผลผลซ้ำ/ล่าช้าต้องกำหนดใน spec

ยังไม่มีหลักฐานว่า merchant สำหรับธุรกิจฝากขายบัตรได้รับอนุมัติ เปิด PromptPay แล้ว
หรือมี verified email domain/บัญชีบริการพร้อม production
ยังไม่ได้ร้องขอ อ่าน หรือบันทึก credentials และไม่มี infrastructure ที่ setup นี้สร้างขึ้น
รายละเอียด local test substitutes และ sandbox เป็นงาน specification/implementation ภายหลัง

## Production readiness and cost planning (2026-10-30)

- คง Omise PromptPay, Resend และ Cloudflare R2 ตามเดิม; secret storage/network/DNS baseline อ้างอิง [ADR-0002](0002-local-first-and-aws-production.md) ไม่เปลี่ยน R2 เป็น S3 หรือ Resend เป็น SES
- ยื่น merchant/KYC และขอเปิด PromptPay พร้อม verify sending domain ของ Resend ล่วงหน้าก่อนเปิดขาย
  ใช้ 5–10 วันทำการจากข้อเสนอเป็นระยะเผื่อวางแผนเท่านั้น ไม่ใช่ SLA การอนุมัติจาก Omise; ต้องให้ผู้ให้บริการยืนยันวันและประเภทธุรกิจฝากขายบัตรจริง
- ก่อน production ต้องมี Live Mode/PromptPay ที่อนุมัติแล้ว, verified payment-success time ตาม NQ-05, webhook HTTPS ที่ทดสอบจริง, production Resend domain และ private R2 bucket/สิทธิ์ไฟล์ตาม G-40
- ค่าธรรมเนียม PromptPay 1.65% จากข้อเสนอใช้เป็นสมมติฐานประกอบ estimate เท่านั้น ต้องยืนยัน merchant pricing/ภาษี/ค่าบริการอื่นกับ Omise จริง; ไม่เปลี่ยนกติกาที่ owner รับภาระค่าธรรมเนียมตาม F9
- ไม่ถือว่า Resend ฟรีเพียงเพราะส่งอีเมลต่อเดือนไม่มาก: Free plan มี daily limit (เอกสารปัจจุบัน 100 ฉบับ/วัน) ต้องนับ OTP, retry, บัตรและ lookup emails ตามยอด **orders/emails** จริง ไม่ใช่จำนวนบัตร 4,500 ใบอย่างเดียว
- ตรวจแผนส่งอีเมลที่รองรับ peak เปิดขายและงบจริงก่อนใช้งาน; ช่วง $0–$20/เดือนจากข้อเสนอไม่ใช่ราคาหรือ quota ที่รับรอง
- R2 มีค่าใช้จ่ายตาม storage/operations และสิทธิ์ Free Tier; ไม่รับรอง $0 โดยไม่มี estimate รูป/หลักฐานและจำนวนอ่านเขียนจริง
- การเก็บ secret ใช้ Standard SecureString ตาม ADR-0002; ชื่อ environment variables ให้ยึด integration/auth ที่ implementation ใช้จริง ไม่สมมติ `NEXTAUTH_SECRET` หรือเปลี่ยน auth provider จากตัวอย่าง
- การเตรียมเอกสารนี้ไม่ใช่หลักฐานว่าบัญชี/โดเมนผ่านแล้ว และไม่ได้สมัคร provider หรือส่งอีเมล/รับเงินจริง

## Research references

- [Omise PromptPay](https://docs.omise.co/promptpay)
- [Resend with Next.js and verified domain](https://resend.com/docs/send-with-nextjs)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)

- [Omise pricing](https://www.omise.co/en/pricing)
- [Resend pricing and limits](https://resend.com/pricing)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
