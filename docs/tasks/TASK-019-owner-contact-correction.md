# TASK-019: เจ้าของเว็บแก้ข้อมูลติดต่อของ order ที่ชำระแล้วได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner ตรวจและแก้ email/phone หลัง paid พร้อมประวัติ ขณะที่ buyer/organizer/scanner แก้เองหรือคงสิทธิ์อีเมลเก่าไม่ได้

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-018 — [ผู้ซื้อค้นหาและเปิดบัตรของตนหลัง OTP ได้](TASK-018-guest-order-lookup.md)

## Todo

- [x] ส่งมอบและตรวจ AC-76 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ทำ owner correction UI/authorization และ audit ตาม G-24; ระบุขั้นตอน owner ตรวจความถูกต้องภายใน NQ-06 โดยไม่เพิ่มช่องทาง login/bypass ใหม่
- [x] หลังเปลี่ยน contact ให้ identity/lookup ของ order อ้างข้อมูลใหม่ และไม่ให้ verified session ของอีเมลเดิมถือสิทธิ์อีเมลใหม่; ไม่เปลี่ยน ticket/payment/ยอดเงินตามไปด้วย
- [x] ปฏิเสธการแก้ผ่าน buyer/organizer/scanner ทั้ง UI/direct request แม้เป็น order ของตน
- [x] Verification — Authorization integration ทุก role และ audit contains actor/รายการที่แก้; verified session เดิมอ่านสิทธิ์ใหม่ไม่ได้
- [x] Verification — E2E: owner ตรวจ/แก้แล้ว lookup ด้วยคู่ใหม่+OTP ได้ คู่เก่าใช้ไม่ได้ และ QR/payment reference เดิมยังอยู่
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] Review approved — working tree against deploy; AC-76 and G-24 verified; unit-test (109 passed), integration-test (63 passed), e2e-test (2 passed), typecheck (0 errors), lint (0 errors across 172 files), standalone build (33 routes) passed; no findings.
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

1. **Unit tests (`npm run test:unit`)**:
   - `tests/unit/owner-contact-correction.test.ts`: 4 passed (validates email & phone normalization, rejects non-owner actor roles, validates required audit reason, preserves tickets/financial fields).
   - Total unit suite: 18 files passed, 109/109 tests passed.

2. **Integration tests (`npm run test:integration`)**:
   - `tests/integration/owner-contact-correction.test.ts`: 3 passed.
     - Owner corrects paid order contact details and records immutable audit log.
     - Non-owner actors (organizer, scanner, unauthenticated) and non-paid orders rejected.
     - Session of old email loses access to corrected order, new email+phone gains access.
   - Total integration suite: 19 files passed, 63/63 tests passed.

3. **E2E tests (`npx playwright test tests/e2e/owner-contact-correction.spec.ts`)**:
   - 2 passed (desktop-chromium 28.7s, mobile-chromium 22.7s).
   - Full flow: organizer creates event/session -> owner approves -> guest purchases & timely paid -> owner searches order and updates contact with audit log -> old contact fails lookup -> new contact + OTP retrieves original tickets and QR codes.

4. **Quality Gates**:
   - `npm run lint`: Biome lint checked 172 files, 0 warnings, 0 errors.
   - `npm run typecheck`: Next route types generated, TypeScript checked 0 errors.
   - `npm run build`: Standalone Next.js production build succeeded (33 routes).
