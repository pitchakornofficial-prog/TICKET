# TASK-042: ผู้ซื้อแสดง Stripe PromptPay QR ในหน้าชำระเงินเดิมได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Order ที่มีสิทธิ์/OTP/reservation ยังใช้ได้แสดง Stripe PromptPay QR ตรง quote ในหน้าเดิม กดซ้ำหรือ timeout ไม่สร้างภาระรับเงินเพิ่มและไม่ต่อ deadline แยก test/live ตั้งแต่สร้างรายการ

ใช้ [TASK-014](TASK-014-payment-qr.md) เป็นประวัติและตรวจ source ปัจจุบัน `src/server/payment.ts`, payment-qr route และ `src/components/order-payment-view.tsx`; คง D-27/D-48/D-50

อ้างอิง [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md#stripe-promptpay-contract-2026-10-30), [ข้อตกลง provider P1–P5](../adr/0003-external-integrations.md#payment-provider-change--2026-10-30), [requirements](../requirement.md#payment-provider-change-2026-10-30), [domain/policy](../../CONTEXT.md), [AGENTS/commands](../../AGENTS.md) และ [coverage](README.md#stripe-follow-up-2026-10-30)

## Blocked by

- [TASK-041](TASK-041-stripe-promptpay-contract.md) — contract/หลักฐานเพียงพอสำหรับ QR และการ reconcile

## Todo

- [ ] ส่งมอบเต็ม AC-118 และ re-verify AC-15, AC-26, AC-70 กับ Stripe; ส่วนร่วม AC-12/13 ตรวจ OTP/reservation guard ก่อนสร้าง QR ไม่ทำ reservation เริ่มก่อน confirm หรือเปลี่ยน quote
- [ ] ส่วนร่วม AC-120: concurrent create/confirm, refresh และ ambiguous timeout ตรวจรายการเดิมก่อน retry ไม่สร้างรายการรับเงินเพิ่มหรือเริ่ม deadline ใหม่; ผล event/ticket อยู่ TASK-043 และผล recovery/refund อยู่ TASK-044 จึงยังไม่ปิด AC ทั้งข้อจากงานนี้
- [ ] ส่วนร่วม AC-123: configuration/provider reference แยก test/live, ไม่ส่ง secrets ไป browser/log และ live request ไม่ใช้ QR จำลอง/test payment; TASK-043 ตรวจ webhook/paid/issue และเส้นทาง pay-test จึงครบเมื่อทำทั้งสองงาน
- [ ] เชื่อม Stripe PromptPay ตาม contract TASK-041 โดยใช้ shared PostgreSQL และสตางค์/THB ผูก order ฝั่ง server; reuse auth/quote guards ไม่เพิ่ม ORM/Redis/Connect/hosted Checkout หรือ migration รายการเงินจริง Omise
- [ ] แสดง QR จริงจาก provider ในหน้าเดิมพร้อมยอด/เวลาคงเหลือ; pending/error/unknown ไม่แสดง paid เมื่อ provider timeout และไม่เรียกสร้าง QR ใหม่โดยไม่รู้รายการเดิม; ไม่เขียนสถานะการรับเงินจริงจาก browser
- [ ] Verification — unit exact satang/quote fixtures ทั้งสาม customer-fee modes; PostgreSQL/provider integration ตรวจ cross-buyer/OTP/expired/cancelled guard, reference/mode mismatch, concurrent requests และ timeout หลัง provider สร้างสำเร็จ; ตรวจจำนวน intent ที่เกิดผลและ deadline เดิม
- [ ] Verification — local E2E desktop/mobile: OTP+confirm→หน้า payment เดิม→QR, refresh/retry คง order/deadline ไม่ redirect hosted Checkout; ใช้ Stripe-contract double ที่แยกโหมดชัดเจนพร้อม test-mode contract evidence ตาม TASK-041 ไม่ใช้ double อ้าง merchant readiness
- [ ] ใช้ Verification Policy ใน CONTEXT: unit/integration/E2E/code-review เป็น required เมื่อเกี่ยวข้อง; ถ้า runner ไม่พร้อมหรือ check ไม่ผ่าน ให้บล็อกพร้อมเงื่อนไขปลดบล็อก ไม่ลด policy หรือใช้ manual walkthrough แทน critical-flow automation
- [ ] ตรวจ scripts ปัจจุบันก่อนรัน `npm run typecheck`, `npm run lint`, `npm run build` และชุดที่เกี่ยวข้องผ่าน `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`; บันทึกคำสั่ง/ผลจริงใน Todo ไม่ใช้ผล TASK เดิมแทน Stripe
- [ ] นำ focused change และหลักฐานเข้า code-review ตาม policy และแก้ finding ก่อนจบงาน; local pass ไม่รับรอง Live/PromptPay approval, AWS deployment หรือ capacity
- [ ] หากผู้ใช้หรือนโยบายกำหนดให้ commit ให้ commit เฉพาะ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และตรวจว่ามี Git repository ใช้งานได้ก่อนอ้าง branch/commit

- [ ] Scope-change 2026-10-30: อ้าง G-53/P5 และ AC-124/125 ใน SPEC-001 สำหรับผลชำระ; งานนี้ยังเป็นเจ้าของ QR/create/config เดิม ไม่เลือก paidAt จาก created ของ PaymentIntent และไม่ส่งเวลา browser เป็นหลักฐาน. หลักฐาน QR/replay ใน TASK-041 ใช้ตามขอบเขตที่ทดสอบจริง ไม่ใช่ผลผ่าน runtime ของ TASK-042 หรือ time policy ใหม่.
