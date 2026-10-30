# TASK-043: ผล Stripe ที่ตรวจผ่านออกบัตรเพียงครั้งเดียวและแยก test/live ได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

เฉพาะ Stripe payment ที่ตรวจครบและพิสูจน์ timely success ได้เท่านั้นจึงออกบัตรตาม quota; ผลปลอม/ข้อมูลผิด/เวลาไม่ชัดเจนคงไม่ออกบัตร และ test-mode/เส้นทางจำลองไม่สามารถรับรองเงินจริงใน live mode

ต่อยอด [TASK-015](TASK-015-paid-ticket-issuance.md); ตรวจ `verifyAndProcessPayment`, webhook boundary และ `pay-test` ปัจจุบันโดยรักษางาน done เดิม

อ้างอิง [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md#stripe-promptpay-contract-2026-10-30), [ข้อตกลง provider P1–P5](../adr/0003-external-integrations.md#payment-provider-change--2026-10-30), [requirements](../requirement.md#payment-provider-change-2026-10-30), [domain/policy](../../CONTEXT.md), [AGENTS/commands](../../AGENTS.md) และ [coverage](README.md#stripe-follow-up-2026-10-30)

## Blocked by

- [TASK-042](TASK-042-stripe-promptpay-qr.md) — มี PaymentIntent ที่ผูก order/reference/mode และการสร้างซ้ำที่ตรวจได้

## Todo

- [x] ส่งมอบเต็ม AC-119 และ re-verify AC-16, AC-17, AC-18 กับ Stripe; ตรวจ provider success ก่อนออก ticket ครบตาม quote โดยไม่ partial issue หรือรับรอง paid จาก QR/redirect/client payload
- [x] ส่วนร่วม AC-120: webhook หลาย event/intent เดิม, duplicate/out-of-order และ crash หลัง paid ก่อน issue ไม่เพิ่ม ticket/ยอดและไม่ย้อน paid จากผลเก่า; ต้องร่วม TASK-042 เรื่อง create/retry และ TASK-044 เรื่องเคสคืนจึงปิด AC ทั้งข้อ
- [x] ส่วนร่วม AC-124/125 (แทน AC-122 ที่ superseded): ใช้ created ของ authenticated matching payment_intent.succeeded Event เป็น T ตาม G-53/P5 สำหรับ timely active reservation. เทียบ T*1000 กับ D/C เดิมไม่ปัดค่า; missing/invalid/wrong-type/wrong-intent/wrong-mode/conflicting Event หรือ intent-only succeeded → รอตรวจ ไม่ fallback arrival/now/Intent.created/Charge.created. เก็บ event provenance/ID/API version/mode; resolved-time หลัง release/cancel อยู่ TASK-044.
- [x] ส่งมอบส่วน webhook/paid/issue ของ AC-123 ร่วม configuration/create ใน TASK-042; ป้องกัน test-mode event, forged mode และเส้นทางจำลอง/pay-test จากการออกบัตรหรือเพิ่มยอดเงินจริงใน live mode ต้องทดสอบฝั่ง server ไม่ใช่ซ่อนปุ่มอย่างเดียว
- [x] ตรวจลายเซ็น webhook จาก raw body/endpoint ที่ถูกต้องและ retrieve/verify PaymentIntent ฝั่ง server; จับคู่ reference/order/amount/THB/mode กับข้อมูลที่ระบบผูกไว้ ไม่เชื่อ browser; timeout/lookup ไม่ผ่านไม่เปลี่ยนเป็น verified success
- [x] คงการเชื่อม ticket issuance และ delivery เดิมแบบ idempotent; ไม่เปลี่ยน OTP/สิทธิ์ order หรืออ้างว่าอีเมลถึงแล้วเพราะ provider รับคำขอ
- [x] Verification — unit success-Event timestamp validation/missing/invalid และ T=D/T=C/fractional-cutoff boundary; PostgreSQL/provider integration signed/invalid signatures, wrong order/reference/amount/currency/mode, provider timeout, duplicate event IDs และคนละ event ของ intent เดียว, concurrent/crash retry; ตรวจ ticket/financial count และไม่มี fallback now (Unit: 24 task-owned / 318 all passed; Integration: 16 task-owned passed against PostgreSQL)
- [x] Verification — local E2E desktop/mobile: guest QR→verified timely success→บัตรครบ และ pending/invalid/unknown-time ไม่แสดง paid; integration เรียก test-payment endpoint โดยตรงใน live configuration แล้วไม่เปลี่ยน real-payment state ใช้ doubles ไม่ส่ง Live requests (E2E: 4 passed on desktop/mobile Chromium)
- [x] ใช้ Verification Policy ใน CONTEXT: unit/integration/E2E/code-review เป็น required เมื่อเกี่ยวข้อง; ถ้า runner ไม่พร้อมหรือ check ไม่ผ่าน ให้บล็อกพร้อมเงื่อนไขปลดบล็อก ไม่ลด policy หรือใช้ manual walkthrough แทน critical-flow automation
- [x] ตรวจ scripts ปัจจุบันก่อนรัน `npm run typecheck`, `npm run lint`, `npm run build` และชุดที่เกี่ยวข้องผ่าน `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`; บันทึกคำสั่ง/ผลจริงใน Todo ไม่ใช้ผล TASK เดิมแทน Stripe
- [x] Review approved — working tree against dev-phat; AC-119, AC-120, AC-123, AC-124, AC-125, AC-16, AC-17, AC-18 verified; typecheck, lint, test:unit (318/318), test:integration (141/141), test:e2e (4/4), build passed; no findings.
- [x] หากผู้ใช้หรือนโยบายกำหนดให้ commit ให้ commit เฉพาะ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และตรวจว่ามี Git repository ใช้งานได้ก่อนอ้าง branch/commit

- [x] Scope-change re-verification: G-53/P5 supersedes actual-bank-time proof เดิม; AC-124/125 ร่วม TASK-044 ต้องตรวจ signed matching success Event และ lookup, bank-paid-before-D/event-after-D ให้ late, missing Event แม้ intent succeeded ให้รอตรวจ และ resolved Event recovery โดยไม่ต่อ deadline/ออกซ้ำ. Historical done TASK-015 และ probe ใน TASK-041 ไม่รับรองเกณฑ์ใหม่เอง; ไม่แก้ runtime จนถึง implement-task นี้.
