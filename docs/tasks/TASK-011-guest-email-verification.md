# TASK-011: ลูกค้ากรอกข้อมูลและยืนยันอีเมลโดยไม่สมัครสมาชิกได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Guest กรอกชื่อ อีเมล เบอร์โทร และผ่าน OTP ก่อนเริ่มกันบัตร โดยการส่งซ้ำ/ลองผิดถูกควบคุมตามค่าที่มอบหมายแล้ว

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-007 — [ลูกค้าค้นหาและเปิดรายละเอียดคอนเสิร์ตได้](TASK-007-public-concert-catalog.md)

## Todo

- [x] ส่งมอบและตรวจ AC-57, AC-58, AC-59, AC-60 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ทำ buyer details/OTP UI โดยใช้ Resend/test transport จาก TASK-003 ไม่มี customer account creation และยังไม่กัน stock ก่อน OTP ผ่าน
- [x] ใช้รหัสสุ่ม 6 หลัก 5 นาที one-use ผูก email/purpose/request; resend 60 วินาที สูงสุด 5/15 นาที รหัสใหม่ยกเลิกเก่า
- [x] ผิดครบ 5/15 นาทีให้พัก 15 นาทีตาม email/purpose และ counter ไม่ reset ด้วยการขอรหัสใหม่; ใช้ shared store ตาม ADR-0004
- [x] กำหนดรายละเอียดภายในของ verified-session ตาม NQ-06 โดยบันทึกว่าเป็น implementation choice ไม่ใช่คำตอบใหม่ และไม่เปลี่ยนวิธียืนยันตัวตน
- [x] Verification — Unit/integration controlled clock: expiry/replay/scope/resend/fail-limit ทั้ง request ใหม่และคนละ connection; ข้อมูลบังคับขาดแต่ละค่าไม่ผ่าน (`tests/unit/guest-otp.test.ts` 10 tests, `tests/integration/guest-otp.test.ts` 4 tests)
- [x] Verification — E2E: guest กรอกครบ รับ OTP จาก local inbox ยืนยันได้; wrong/expired/rate-limited path มีสถานะตามจริงและยังไม่เริ่ม reservation (`tests/e2e/guest-email-verification.spec.ts` 2 tests ผ่านทั้ง desktop และ mobile)
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง:
  - `npm run typecheck` — 0 errors
  - `npm run lint` — 0 warnings, 0 errors across 122 files
  - `npm run test:unit` — 77/77 passed
  - `npm run test:integration` — 34/34 passed
  - `npx playwright test tests/e2e/guest-email-verification.spec.ts` — 2/2 passed
  - `npm run build` — standalone build success
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] Review approved — working tree against origin/deploy; AC-57, AC-58, AC-59, and AC-60 verified; typecheck (0 errors), lint (0 errors/warnings), unit tests (77/77 passed), integration tests (34/34 passed), e2e tests (2/2 passed across desktop/mobile), and standalone build passed; no findings.
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow (เตรียม focused diff สำหรับ TASK-011 แล้ว)
