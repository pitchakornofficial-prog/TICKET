# ADR-0003: Omise, Resend และ Cloudflare R2

- Status: accepted
- Date: 2026-10-19
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

## Research references

- [Omise PromptPay](https://docs.omise.co/promptpay)
- [Resend with Next.js and verified domain](https://resend.com/docs/send-with-nextjs)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
