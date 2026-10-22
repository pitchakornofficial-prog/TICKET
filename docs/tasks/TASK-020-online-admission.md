# TASK-020: ทีมสแกนบันทึกเข้า ออก และกลับเข้าแบบออนไลน์ได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Scanner ตรวจ ticket กลางตามงาน/รอบ/ช่วงรับเข้าแล้วบันทึก entry/exit อย่างถูกต้อง รวมป้องกัน concurrent entry ซ้ำ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-009 — [ผู้จัดงานเพิ่มทีมสแกนเฉพาะงานได้](TASK-009-scanner-accounts.md)
- TASK-015 — [ชำระสำเร็จที่ตรวจแล้วออก QR แยกใบได้](TASK-015-paid-ticket-issuance.md)

## Todo

- [x] ส่งมอบและตรวจ AC-08, AC-39, AC-49, AC-95, AC-100, AC-101 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-65: online ticket/scan response ไม่มี buyer PII; TASK-032 ตรวจ offline dataset; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-032 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ให้ organizer กำหนด admission window แยกรอบและ scanner เลือกเฉพาะ scope ตน; camera/UI ตาม D-05/D-10/D-11 โดยไม่เพิ่ม manual admission override
- [x] ทำ online state transition out→in→out→in โดยต้องมี exit ก่อน reentry; repeat in/invalid exit ไม่สร้างประวัติขัดแย้ง
- [x] ตรวจ paid/valid/not revoked/event/session/window ที่ central state; round ยกเลิก ผิดรอบ หรือ scope ไม่มีสิทธิ์ไม่ผ่าน
- [x] เฉพาะเลขบัตร/type/session/entry-exit และข้อมูลที่จำเป็น ไม่มี buyer name/email/phone ทั้ง UI/response; admission history ใช้ตรวจ refund ภายหลังได้
- [x] Verification — Unit/integration: wrong event/session/window/revoked และ entry/exit/reentry matrix; PostgreSQL concurrent two scans ให้ successful entry เพียงหนึ่ง
- [x] Verification — E2E/camera walkthrough local: valid ticket ผ่านพร้อม history, repeat ไม่ผ่าน, exit→reentry ผ่าน; ผลมี text+icon ไม่พึ่งสี
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] Review approved — working tree against HEAD; AC-08, AC-39, AC-49, AC-95, AC-100, AC-101, AC-65 verified; unit (4/4 admission, 113/113 total), integration (3/3 admission, 66/66 total), e2e (2/2 online-admission desktop & mobile), typecheck (0 errors), lint (0 errors) passed; no findings.
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

1. **Unit tests (`npm run test:unit`)**:
   - `tests/unit/admission.test.ts`: 4 passed
     - Rejects unauthorized roles.
     - Enforces session admission window start and end (AC-100).
     - Denies scanner scanning unassigned events (AC-08).
     - Strictly scrubs and omits buyer PII (AC-65).
   - Total unit suite: 19 files passed, 113/113 tests passed.

2. **Integration tests (`npm run test:integration`)**:
   - `tests/integration/admission.test.ts`: 3 passed
     - Full admission state transition cycle: outside -> in -> repeat in (rejected: `ALREADY_INSIDE`) -> exit -> repeat exit (rejected: `NOT_INSIDE`) -> reentry (AC-08, AC-39, AC-49, AC-95).
     - Concurrency control via PostgreSQL `SELECT ... FOR UPDATE`: two concurrent entry scans result in exactly 1 success and 1 rejection (AC-101).
     - Cross-event scanner rejection (AC-08), wrong session rejection (AC-100), and revoked/cancelled/refunded ticket rejection (AC-101).
     - Realtime statistics calculation and non-PII audit trail history logging.
   - Total integration suite: 20 files passed, 66/66 tests passed.

3. **E2E tests (`npx playwright test tests/e2e/online-admission.spec.ts`)**:
   - 2 passed (desktop-chromium 24.0s, mobile-chromium 19.3s; total 54.3s).
   - Full flow: organizer creates event and session -> assigns scanner account -> owner approves session -> buyer purchases ticket via guest flow -> scanner logs in -> launches admission terminal for assigned session -> scans valid entry -> repeat entry rejected -> scans exit -> scans reentry -> checks realtime stats (inside, entries, exits) and audit table -> confirms no buyer PII in terminal view -> passes zero emoji and responsive mobile layout rules.

4. **Quality Gates**:
   - `npm run lint`: Biome lint checked 179 files, 0 warnings, 0 errors.
   - `npm run typecheck`: Next route types generated, TypeScript checked 0 errors.
   - `npm run build`: Standalone Next.js production build succeeded (35 routes).
