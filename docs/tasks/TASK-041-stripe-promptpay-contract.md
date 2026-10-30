# TASK-041: พิสูจน์ Stripe PromptPay contract ก่อนเชื่อมรับเงิน

- Status: todo
- Type: spike
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

ยืนยันว่า QR/reference/expiry/cancellation และหลักฐานเวลาชำระจริงของ Stripe รองรับกติกา D/C/T ใน SPEC-001 ได้อย่างไร เพื่อปลด technical boundary ให้ TASK-042–044 โดยไม่เดา field หรือเปลี่ยนกฎธุรกิจ งานนี้เป็น research spike ไม่ส่งมอบ AC ผู้ใช้เอง

ต่อจากหลักฐานเดิม [TASK-014](TASK-014-payment-qr.md) และ [TASK-027](TASK-027-cancel-pending-payments.md); ทั้งสองยังเป็น done ไม่ใช่หลักฐาน Stripe

อ้างอิง [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md#stripe-promptpay-contract-2026-10-30), [ข้อตกลง provider P1–P4](../adr/0003-external-integrations.md#payment-provider-change--2026-10-30), [requirements](../requirement.md#payment-provider-change-2026-10-30), [domain/policy](../../CONTEXT.md), [AGENTS/commands](../../AGENTS.md) และ [coverage](README.md#stripe-follow-up-2026-10-30)

## Blocked by

- None

## Todo

- [ ] ระบุคำถาม/ขอบเขต NQ-05: วิธีสร้าง/แสดง PromptPay QR ในเว็บเดิม, idempotency/reconciliation หลัง timeout, status ที่ cancel ได้, อายุ QR และ semantics/precision ของ actual success time เทียบ D/C; ไม่สำรวจ provider อื่นหรือเปลี่ยน stack
- [ ] ใช้ Context7 resolve-library-id ก่อน query-docs และ official Stripe docs ที่ตรง PromptPay/API version; แยกสิ่งที่เอกสารยืนยัน สิ่งที่ต้องทดสอบ และสิ่งที่ยังไม่ทราบ ไม่ใช้ PayNow/Swish หรือ PaymentIntent/Charge/Event created แทน paid time โดยไม่มีหลักฐาน
- [ ] บันทึก contract evidence ที่มี URL/API version/date และ field mapping, amount/currency/mode/reference, signed webhook/provider lookup, retry และ cancellation outcomes พร้อมตัวอย่าง sanitized ที่ไม่มี secrets ใน Todo นี้
- [ ] ตรวจข้อมูลใน repository ของ payment/expiry/cancellation/test-payment boundaries เพื่อระบุจุดที่ใช้ paidAt fallback หรือ QR จำลอง; เป็น evidence ของปัจจุบัน ไม่ใช่ข้อกำหนดใหม่ ไม่แก้ runtime ใน spike
- [ ] หากจำเป็นต้องใช้ test account ที่มีอยู่ ให้ใช้เฉพาะ test-mode probe ที่ทราบผลและได้รับสิทธิ์เข้าถึงแล้ว; ถ้าขาด credentials/access บันทึก blocker/วิธีปลดโดยไม่อ่านหรือพิมพ์ secrets ไม่ติดตั้ง cloud service ไม่เปิด Live/รับเงินจริง
- [ ] Exit condition: มีหลักฐานที่ตรวจย้อนกลับได้เพียงพอให้ TASK-042 สร้าง QR จริงใน test mode และ TASK-043/044 ตรวจเวลา/หมดอายุ/cancellation ตามสเปก รวม boundary T=D/T=C; หาก provider ไม่ให้ข้อมูลเวลาที่พอพิสูจน์ได้ ให้บันทึก boundary ที่ blocked พร้อมเหตุ ไม่อ้าง spike ผ่านหรือทำให้ AC-122 ผ่านด้วย double และส่งกลับ write-spec/grill-workflow เมื่อจำเป็นต้องเปลี่ยน contract
- [ ] Verification: review ตาราง evidence เทียบ AC-118–123 และ NQ-05; research ไม่เท่ากับส่งมอบ AC หรือ live readiness ตรวจเอกสาร/ลิงก์และ code-review ของผล spike; ไม่รัน app suites ถ้าไม่ได้เปลี่ยน runtime/tests
- [ ] ใช้ Verification Policy ใน CONTEXT: unit/integration/E2E/code-review เป็น required เมื่อเกี่ยวข้อง; ถ้า runner ไม่พร้อมหรือ check ไม่ผ่าน ให้บล็อกพร้อมเงื่อนไขปลดบล็อก ไม่ลด policy หรือใช้ manual walkthrough แทน critical-flow automation
- [ ] ตรวจ scripts ปัจจุบันก่อนรัน `npm run typecheck`, `npm run lint`, `npm run build` และชุดที่เกี่ยวข้องผ่าน `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`; บันทึกคำสั่ง/ผลจริงใน Todo ไม่ใช้ผล TASK เดิมแทน Stripe
- [ ] นำ focused change และหลักฐานเข้า code-review ตาม policy และแก้ finding ก่อนจบงาน; local pass ไม่รับรอง Live/PromptPay approval, AWS deployment หรือ capacity
- [ ] หากผู้ใช้หรือนโยบายกำหนดให้ commit ให้ commit เฉพาะ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และตรวจว่ามี Git repository ใช้งานได้ก่อนอ้าง branch/commit
