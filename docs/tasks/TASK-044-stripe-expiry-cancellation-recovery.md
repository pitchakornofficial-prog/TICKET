# TASK-044: เงิน Stripe หลังหมดเวลาหรือยกเลิกถูกจัดการตามเวลาจริงได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

เมื่อหมดเวลา/ยกเลิกรอบ หยุดเสนอ QR และคืน quota ครั้งเดียว แต่ยังติดตาม Stripe payment/cancellation race; late/unknown-time results จัดสรรใหม่หรือเข้ารอคืนถูกยอดตาม D/C/T โดย owner โอนเอง

ต่อยอด [TASK-013](TASK-013-reservation-expiry.md), [TASK-016](TASK-016-late-payment-recovery.md), [TASK-027](TASK-027-cancel-pending-payments.md) และกฎ report ของ [TASK-028](TASK-028-organizer-money-report.md) โดยไม่ reopen งาน done

อ้างอิง [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md#stripe-promptpay-contract-2026-10-30), [ข้อตกลง provider P1–P4](../adr/0003-external-integrations.md#payment-provider-change--2026-10-30), [requirements](../requirement.md#payment-provider-change-2026-10-30), [domain/policy](../../CONTEXT.md), [AGENTS/commands](../../AGENTS.md) และ [coverage](README.md#stripe-follow-up-2026-10-30)

## Blocked by

- [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) — รับผล Stripe ที่ตรวจครบและแยกเวลาไม่ทราบได้

## Todo

- [ ] ส่งมอบเต็ม AC-121 และ re-verify AC-71, AC-72, AC-73, AC-74, AC-112, AC-113, AC-114 กับ Stripe; คง deadline/quote เดิม และไม่สร้าง QR ใหม่ให้ order expired/cancelled
- [ ] ส่วนร่วม AC-120: delayed success/reconciliation/ซ้ำ/ผิดลำดับไม่สร้างเคสคืนหรือยอดซ้ำ ร่วม create/issue ใน TASK-042/043; ส่วนร่วม AC-122: unknown-time หลัง release/cancel รอตรวจและเมื่อพิสูจน์ T ได้แล้วใช้ D/C/T โดยไม่เดาเวลา ร่วม active/timely path ใน TASK-043
- [ ] เชื่อม expiry/cancellation กับการหยุดแสดง QR และคืน quota ครั้งเดียวแม้ Stripe ไม่ตอบ; QR ที่ลูกค้าบันทึกไว้อาจยังใช้ได้ ไม่อ้างซ่อน UI เท่ากับ provider cancel สำเร็จ
- [ ] ปฏิบัติต่อ Stripe cancellation ตามสถานะที่ contract TASK-041 ยืนยัน; cancel ไม่สำเร็จ/timeout/แข่ง success ต้องติดตามต่อ ไม่ลบ payment/quote/ประวัติและไม่คืน quota ซ้ำ
- [ ] รอบไม่ยกเลิก: timely late result จัดสรรใหม่เมื่อครบทุก type; quota ไม่พอหรือ T>D ไม่ issue และเข้า owner review คืนเต็ม received total รวม customer fee
- [ ] รอบยกเลิก: T>D คืนเต็มตาม G-35; T<=D และ T<C คืนเฉพาะราคาบัตร; T<=D และ T>=C รวม T=C คืนเต็ม; ไม่ออก ticket ใหม่เพื่อคืนเงิน ไม่เปลี่ยนยอดเคสที่ประมวลผลไปแล้วจาก callback ซ้ำ
- [ ] ตรวจ manual transfer/refund/report ต่อเนื่องตาม AC-37, AC-84, AC-93: ไม่เรียก Stripe refund API, unissued funds ไม่กลายเป็น organizer entitlement/หัก refund ซ้ำ และ pending transfer ยังคง liability; ไม่ขยาย UI ใหม่หรือเปลี่ยน financial formulas
- [ ] Verification — controlled-clock unit/provider/PostgreSQL integration: T<D/T=D/T>D และ T<C/T=C/T>C, D<T<C, unknown→verified time, saved QR, cancel timeout/failure/success race, quota แย่งกับ buyer ใหม่/หนึ่ง type ไม่พอ; ตรวจ ticket/quota/case/ยอดครั้งเดียว
- [ ] Verification — local E2E desktop/mobile: expired/cancelled QR ถูกหยุดเสนอ, refresh ไม่สร้าง QR ใหม่, late notification→ticket หรือ owner review ถูกเหตุ/ยอด และ unknown-time รอตรวจ; owner โอนคืนเองโดยไม่สั่ง Stripe refund พร้อม report isolation regression
- [ ] ใช้ Verification Policy ใน CONTEXT: unit/integration/E2E/code-review เป็น required เมื่อเกี่ยวข้อง; ถ้า runner ไม่พร้อมหรือ check ไม่ผ่าน ให้บล็อกพร้อมเงื่อนไขปลดบล็อก ไม่ลด policy หรือใช้ manual walkthrough แทน critical-flow automation
- [ ] ตรวจ scripts ปัจจุบันก่อนรัน `npm run typecheck`, `npm run lint`, `npm run build` และชุดที่เกี่ยวข้องผ่าน `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`; บันทึกคำสั่ง/ผลจริงใน Todo ไม่ใช้ผล TASK เดิมแทน Stripe
- [ ] นำ focused change และหลักฐานเข้า code-review ตาม policy และแก้ finding ก่อนจบงาน; local pass ไม่รับรอง Live/PromptPay approval, AWS deployment หรือ capacity
- [ ] หากผู้ใช้หรือนโยบายกำหนดให้ commit ให้ commit เฉพาะ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และตรวจว่ามี Git repository ใช้งานได้ก่อนอ้าง branch/commit
