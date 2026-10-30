# TASK-043: ผล Stripe ที่ตรวจผ่านออกบัตรเพียงครั้งเดียวและแยก test/live ได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

เฉพาะ Stripe payment ที่ตรวจครบและพิสูจน์ timely success ได้เท่านั้นจึงออกบัตรตาม quota; ผลปลอม/ข้อมูลผิด/เวลาไม่ชัดเจนคงไม่ออกบัตร และ test-mode/เส้นทางจำลองไม่สามารถรับรองเงินจริงใน live mode

ต่อยอด [TASK-015](TASK-015-paid-ticket-issuance.md); ตรวจ `verifyAndProcessPayment`, webhook boundary และ `pay-test` ปัจจุบันโดยรักษางาน done เดิม

อ้างอิง [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md#stripe-promptpay-contract-2026-10-30), [ข้อตกลง provider P1–P4](../adr/0003-external-integrations.md#payment-provider-change--2026-10-30), [requirements](../requirement.md#payment-provider-change-2026-10-30), [domain/policy](../../CONTEXT.md), [AGENTS/commands](../../AGENTS.md) และ [coverage](README.md#stripe-follow-up-2026-10-30)

## Blocked by

- [TASK-042](TASK-042-stripe-promptpay-qr.md) — มี PaymentIntent ที่ผูก order/reference/mode และการสร้างซ้ำที่ตรวจได้

## Todo

- [ ] ส่งมอบเต็ม AC-119 และ re-verify AC-16, AC-17, AC-18 กับ Stripe; ตรวจ provider success ก่อนออก ticket ครบตาม quote โดยไม่ partial issue หรือรับรอง paid จาก QR/redirect/client payload
- [ ] ส่วนร่วม AC-120: webhook หลาย event/intent เดิม, duplicate/out-of-order และ crash หลัง paid ก่อน issue ไม่เพิ่ม ticket/ยอดและไม่ย้อน paid จากผลเก่า; ต้องร่วม TASK-042 เรื่อง create/retry และ TASK-044 เรื่องเคสคืนจึงปิด AC ทั้งข้อ
- [ ] ส่วนร่วม AC-122: ตรวจ paid-time semantics/precision ตาม TASK-041 สำหรับ timely active reservation และ unknown-time→รอตรวจ ไม่ fallback เป็นเวลารับ callback/created/now; resolved-time หลัง release/cancel อยู่ TASK-044
- [ ] ส่งมอบส่วน webhook/paid/issue ของ AC-123 ร่วม configuration/create ใน TASK-042; ป้องกัน test-mode event, forged mode และเส้นทางจำลอง/pay-test จากการออกบัตรหรือเพิ่มยอดเงินจริงใน live mode ต้องทดสอบฝั่ง server ไม่ใช่ซ่อนปุ่มอย่างเดียว
- [ ] ตรวจลายเซ็น webhook จาก raw body/endpoint ที่ถูกต้องและ retrieve/verify PaymentIntent ฝั่ง server; จับคู่ reference/order/amount/THB/mode กับข้อมูลที่ระบบผูกไว้ ไม่เชื่อ browser; timeout/lookup ไม่ผ่านไม่เปลี่ยนเป็น verified success
- [ ] คงการเชื่อม ticket issuance และ delivery เดิมแบบ idempotent; ไม่เปลี่ยน OTP/สิทธิ์ order หรืออ้างว่าอีเมลถึงแล้วเพราะ provider รับคำขอ
- [ ] Verification — unit paid-time proof/missing/precision boundary; PostgreSQL/provider integration signed/invalid signatures, wrong order/reference/amount/currency/mode, provider timeout, duplicate event IDs และคนละ event ของ intent เดียว, concurrent/crash retry; ตรวจ ticket/financial count และไม่มี fallback now
- [ ] Verification — local E2E desktop/mobile: guest QR→verified timely success→บัตรครบ และ pending/invalid/unknown-time ไม่แสดง paid; integration เรียก test-payment endpoint โดยตรงใน live configuration แล้วไม่เปลี่ยน real-payment state ใช้ doubles ไม่ส่ง Live requests
- [ ] ใช้ Verification Policy ใน CONTEXT: unit/integration/E2E/code-review เป็น required เมื่อเกี่ยวข้อง; ถ้า runner ไม่พร้อมหรือ check ไม่ผ่าน ให้บล็อกพร้อมเงื่อนไขปลดบล็อก ไม่ลด policy หรือใช้ manual walkthrough แทน critical-flow automation
- [ ] ตรวจ scripts ปัจจุบันก่อนรัน `npm run typecheck`, `npm run lint`, `npm run build` และชุดที่เกี่ยวข้องผ่าน `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`; บันทึกคำสั่ง/ผลจริงใน Todo ไม่ใช้ผล TASK เดิมแทน Stripe
- [ ] นำ focused change และหลักฐานเข้า code-review ตาม policy และแก้ finding ก่อนจบงาน; local pass ไม่รับรอง Live/PromptPay approval, AWS deployment หรือ capacity
- [ ] หากผู้ใช้หรือนโยบายกำหนดให้ commit ให้ commit เฉพาะ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และตรวจว่ามี Git repository ใช้งานได้ก่อนอ้าง branch/commit
