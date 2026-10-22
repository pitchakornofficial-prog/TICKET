# TASK-031: ยอดติดลบและเงินรับคืนจากผู้จัดงานอยู่เฉพาะงานเดิมได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner/organizer เห็นยอดค้างจาก refund หลัง payout ของงานเดิม และ owner บันทึกรับคืนจริงโดยไม่หักข้ามงาน

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#settlement-and-reserve-invariants), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-029 — [เจ้าของเว็บจ่ายรายสัปดาห์และบันทึกหลักฐานโดยไม่จ่ายยอดเดิมซ้ำได้](TASK-029-weekly-manual-payout.md)

## Todo

- [x] ส่งมอบและตรวจ AC-85, AC-86 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] รายงาน L ติดลบแยกเหตุจาก flat fee carry/ยอดเกินจ่ายจาก refund ตามสเปก; หักเฉพาะรายรับถัดไปของ event เดิม ไม่แตะอีกงานของ organizer เดียวกัน
- [x] เมื่อไม่มี payout ถัดไปให้แสดง receivable งานเดิมเพื่อ owner ติดตาม; เพิ่ม X เมื่อตรวจ/บันทึกรับเงินจริง ไม่ตัดหนี้จากการสร้างรายการติดตาม
- [x] ป้องกัน duplicate repayment record ไม่ลดหนี้/เพิ่ม payable ซ้ำและไม่ทำให้แก้ประวัติ paid/refund ย้อนหลัง
- [x] Verification — Unit/accounting integration สอง event organizer เดียวกัน: E450/P810/X0 ได้ debt360, B ไม่ถูกหัก; บันทึก X360 แล้ว L0 และ retry ไม่เปลี่ยนอีก
- [x] Verification — E2E owner บันทึกรับคืนและ organizer อ่านยอดงานตนพร้อมสถานะได้โดยไม่เห็นงานอื่น/หลักฐานที่ไม่มีสิทธิ์
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

- `npm run lint` — ผ่าน 243 files, 0 errors, 0 warnings
- `npm run typecheck` — ผ่าน (Next route types + tsc --noEmit, 0 errors)
- `npm run test:unit` — ผ่าน 160 unit tests across 30 files (รวม 4 tests ใน `tests/unit/debt-repayment.test.ts`)
- `npm run test:integration` — ผ่าน 108 integration tests across 31 files (รวม 3 tests ใน `tests/integration/debt-repayment.test.ts` เชื่อม PostgreSQL จริง ตรวจสอบ event debt isolation, repayment recording, 15-second duplicate protection, และ role isolation)
- `npx playwright test tests/e2e/debt-repayment.spec.ts` — ผ่าน 2 tests across desktop-chromium (59.1s) และ mobile-chromium (51.7s)
- `npm run build` — ผ่าน (standalone production packaging, 38 routes สำเร็จ)

## Review Evidence

- Mode: Final review ผ่านเกณฑ์ code-review
- Criteria Verification:
  * AC-85 & G-33: คำนวณ Net Entitlement, Reserve, และ Net Liability (L = E - P + X) แยกต่องานอย่างเคร่งครัด ยอดหนี้ค้างชำระของ Event A ที่เกิดจาก approved refund หลัง payout ไม่ถูกนำไปหักข้ามไปยัง Event B ของ organizer เดียวกัน
  * AC-86 & G-39: ยอดค้างแสดงแยกเหตุผล (flat fee debt vs excess payout refund debt) และคงสถานะ receivable จนกว่า owner จะบันทึกการรับชำระเงินจริง (`POST /api/owner/events/[id]/debt-repayments`) พร้อม idempotency 15 วินาทีป้องกันการบันทึกซ้ำ
  * Role Authorization: จำกัดสิทธิ์เฉพาะ owner (organizer และ scanner ถูกปฏิเสธ 403, unauthenticated ได้รับ 401)
  * Design & UI Standards: ภาษาไทย, Kanit font, ไม่มี emoji (ใช้ pure SVG icons ทั้งหมด), ระบบสี 60/30/10, รองรับ mobile responsive
  * Persistence: จัดเก็บประวัติลง PostgreSQL จริง (`event_debt_repayments`) ไม่พึ่งพา in-memory state
- Findings: ไม่พบข้อบกพร่อง (P0–P3: 0 findings)
- Status Decision: Approved -> `done`
