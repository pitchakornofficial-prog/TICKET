# TASK-024: การแก้รอบที่เปิดขายมีผลเมื่ออนุมัติและรักษาสิทธิ์เดิม

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer ส่งราคา/เวลา/quota ฉบับใหม่ให้ owner อนุมัติได้ โดย quote เดิมไม่เปลี่ยนและจำนวนใหม่ไม่ทำสิทธิ์สูญหาย

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-015 — [ชำระสำเร็จที่ตรวจแล้วออก QR แยกใบได้](TASK-015-paid-ticket-issuance.md)

## Todo

- [x] ส่งมอบและตรวจ AC-67, AC-68, AC-109 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ทำ pending amendment/review/approve สำหรับ live session โดยยังแสดง/ใช้ approved version เดิมระหว่างรอ ตาม G-12
- [x] เมื่ออนุมัติราคา/customer fee ใหม่ ให้ reservation เดิมคง quote ตลอด 15 นาที แต่การเริ่ม order ใหม่ใช้ค่าที่มีผลใหม่; ไม่ปลดล็อก organizer fee ตาม G-49
- [x] ปฏิเสธ quota ใหม่ที่ต่ำกว่า issued/active-reserved rights แบบ atomic กับ reserve/issue ไม่ลบสิทธิ์เดิมหรือทำ quota ติดลบ
- [x] การขอเลื่อน/ยกเลิกทั้งรอบและ special refund window อยู่ TASK-025/TASK-026 ไม่ตีความการแก้ข้อมูลเป็นอนุมัติยกเลิกเอง
- [x] Verification — Integration version/time: pending→approved ราคา/เวลา/จำนวน public ใช้ version ถูกต้อง active quote คงเดิม
- [x] Verification — PostgreSQL concurrent quantity edit/reserve/issue และ E2E owner approval ระหว่าง checkout; ตรวจยอด QR/order เดิมไม่เปลี่ยน
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
- [x] Review approved — working tree against origin/deploy; AC-67, AC-68, AC-109 verified; unit-test (127 passed), integration-test (3 passed), e2e-test (2 passed), typecheck (0 errors), lint (0 errors) passed; no findings.

## Verification Evidence

1. **Unit Tests (`vitest.unit.config.ts`):**
   - Command: `npm run test:unit`
   - Result: 23 passed test files, 127 passed tests (including `tests/unit/approved-live-edits.test.ts` with 3 passed tests).

2. **Integration Tests (`vitest.integration.config.ts`):**
   - Command: `npm run test:integration -- tests/integration/approved-live-edits.test.ts`
   - Result: 1 passed test file, 3 passed tests:
     - `rejects session amendment submission or approval when proposed quota is lower than held rights (AC-109)`
     - `allows organizer to submit amendment and keeps public session unchanged while pending (AC-67, G-12)`
     - `preserves existing active reservation quote when amendment is approved, while new orders get new price (AC-67, AC-68)`

3. **E2E Tests (`playwright.config.ts`):**
   - Command: `$env:PLAYWRIGHT_BROWSERS_PATH=".cache/ms-playwright"; npx playwright test tests/e2e/approved-live-edits.spec.ts`
   - Result: 2 passed across `desktop-chromium` (41.1s) and `mobile-chromium` (31.6s).
   - Validated:
     - Organizer submits amendment for live approved session.
     - While pending, public event page displays original price and quota (AC-67, G-12).
     - Atomic quota protection rejects lower quota than held rights (AC-109).
     - Owner reviews and approves amendment at `/back-office/owner`.
     - Active pre-existing reservation retains its locked quotation throughout hold period (AC-68).
     - New reservations and buyers receive the updated price and quota immediately (AC-67).

4. **Lint & Typecheck:**
   - `npm run lint` — Biome 2.5.15 checked 206 files with 0 warnings, 0 errors.
   - `npm run typecheck` — Next route typegen + TypeScript completed with 0 errors.

5. **Build:**
   - `npm run build` — Standalone production build compiled successfully with all static and dynamic routes.
