# TASK-040: แยกขั้นตอนการซื้อบัตรเป็น 4 หน้า พร้อมห้องรอคิวและแถบขั้นตอน

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

แยกขั้นตอนการซื้อบัตรจากหน้าเดียวเป็น 4 ขั้นตอน/หน้าอย่างชัดเจนตาม AC-117 และ D-27:
1. หน้ารายละเอียดคอนเสิร์ต (`/events/[id]`): แสดงข้อมูลงาน รอบการแสดง ราคาบัตร และปุ่ม CTA "ซื้อบัตร" (Buy Tickets) เพื่อเริ่มโฟลว์
2. ห้องรอคิว (`/events/[id]/queue`): หน้าจอห้องรอคิวแสดงลำดับคิว จำนวนคนที่รออยู่ข้างหน้า และเวลารอโดยประมาณ พร้อมการเปลี่ยนผ่านเข้าสู่หน้าเลือกบัตรเมื่อถึงคิว
3. หน้าเลือกบัตรและกรอกข้อมูลผู้ซื้อ (`/events/[id]/checkout`): เลือกรอบ/จำนวนบัตร กรอกข้อมูลผู้ซื้อ & ยืนยัน OTP และกดยืนยันเพื่อล็อกโควตา 15 นาที
4. หน้าชำระเงิน (`/orders/[id]/payment`): แสดงเวลานับถอยหลัง 15 นาที สรุปยอดเงิน QR PromptPay สำหรับชำระเงิน และแสดงบัตรดิจิทัลเมื่อชำระเงินสำเร็จ
ทุกหน้ามีแถบ Step Indicator ด้านบนแสดงขั้นตอนปัจจุบันตามดีไซน์ Modern Soft Floating Cards (16px radius, soft shadow)

อ้างอิง [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md), [D-24–D-27 ใน requirement.md](../requirement.md#ui-design-requirements), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md)

## Blocked by

- [x] [TASK-015: ชำระสำเร็จที่ตรวจแล้วออก QR แยกใบได้](TASK-015-paid-ticket-issuance.md)
- [x] [TASK-036: ทุกบทบาทใช้หน้าจอตามธีม ภาษา และอุปกรณ์ที่ตกลงได้](TASK-036-responsive-role-interfaces.md)

## Todo

- [x] ส่งมอบผลลัพธ์ของ AC-117 ตาม D-27
- [x] ออกแบบและสร้างคอมโพเนนต์ `PurchaseStepIndicator` แสดง 4 ขั้นตอน: 1) รายละเอียด 2) รอคิว 3) เลือกบัตรและกรอกข้อมูล 4) ชำระเงิน
- [x] ปรับปรุงหน้ารายละเอียดคอนเสิร์ต `/events/[id]` ให้เน้นเนื้อหา โซนราคา และมีปุ่ม CTA "ซื้อบัตร" นำทางไปยัง `/events/[id]/queue`
- [x] สร้างหน้าห้องรอคิว `/events/[id]/queue` (Queue Waiting Room) แสดงลำดับคิว จำนวนคนข้างหน้า และเวลารอ พร้อมปุ่ม/การเปลี่ยนผ่านเข้าสู่ checkout
- [x] สร้างหน้าเลือกบัตรและกรอกข้อมูล `/events/[id]/checkout` ให้เลือกรอบ/จำนวนบัตรก่อน กรอกข้อมูลผู้ซื้อ & ยืนยัน OTP แล้วสร้าง reservation 15 นาที และนำทางไปหน้าชำระเงิน
- [x] สร้างหน้าชำระเงิน `/orders/[id]/payment` สำหรับแสดง countdown 15 นาที สรุปราคา QR PromptPay และแสดงบัตรพร้อม QR Code เมื่อชำระเงินสำเร็จ
- [x] ใช้งานดีไซน์ระบบ Modern Soft Floating Cards: ขอบโค้งมน 16px, พื้นขาวบนแคนวาสเทาอ่อน, เงานุ่ม diffused shadow, ฟอนต์ Kanit, ภาษาไทย, pure SVG icons (zero emojis)
- [x] Verification — Unit/Integration/E2E: ทดสอบการทำงานของแต่ละหน้าและการนำทางต่อเนื่องจนเสร็จสิ้น
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ตาม Verification Policy ใน CONTEXT และบันทึกผลการตรวจสอบจริง
- [x] นำ focused change และ evidence เข้า code-review เพื่อตรวจสอบความถูกต้องก่อนสรุปงาน

## Verification Evidence

1. **Unit Testing (`tests/unit/multi-step-purchase-journey.test.ts`)**:
   - `PurchaseStepIndicator`: ตรวจสอบ 4 ขั้นตอน แสดงภาษาไทย ลิงก์ถูกต้อง และปราศจาก emoji
   - `/events/[id]`: ตรวจสอบการแยกออกจากโฟลว์จองเดิม มีปุ่มนำทางเข้าคิว `/events/[id]/queue`
   - `/events/[id]/queue`, `/events/[id]/checkout`, `/orders/[id]/payment`: มี UI ลำดับคิว, เลือกบัตรก่อนกรอก OTP, และนับถอยหลัง 15 นาทีพร้อม PromptPay QR
   - ผลการรัน: `npm run test:unit` ผ่าน 39/39 test files (193/193 tests passed)

2. **Code Quality & Standards**:
   - `npm run lint`: Biome 2.5.15 ผ่าน 293 files, 0 errors, 0 warnings
   - `npm run typecheck`: Next route types + TypeScript ผ่าน 0 errors
   - `npm run build`: สร้าง Next.js 16.4.2 Standalone production package ผ่าน 40 routes ครบถ้วน รวมถึง `/events/[id]/queue`, `/events/[id]/checkout`, `/orders/[id]/payment`

3. **Design & UX Guidelines (D-24–D-27)**:
   - ปรับใช้ระบบ Modern Soft Floating Cards: `border-radius: 16px`, พื้นหลังการ์ดขาว `#ffffff` บนแคนวาส `#f8fafc`, เงา diffused floating shadows
   - ภาษาไทย ฟอนต์ Kanit สกุลเงิน THB และ pure SVG icons (zero emojis) ตลอดทุกหน้าจอ

