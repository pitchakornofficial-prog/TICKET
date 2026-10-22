# TASK-025: เลื่อนรอบโดยอนุมัติและเปิดช่วงคืนพิเศษได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer ขอเลื่อนรอบและ owner ทำให้เวลาใหม่มีผลพร้อมกำหนด special refund window ซึ่งยื่นคืนได้แม้พ้น cutoff ปกติ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-024 — [การแก้รอบที่เปิดขายมีผลเมื่ออนุมัติและรักษาสิทธิ์เดิม](TASK-024-approved-live-edits.md) (done)
- TASK-021 — [ลูกค้ายื่นคืนบางใบที่เข้าเงื่อนไขได้](TASK-021-refund-requests.md) (done)

## Todo

- [x] ส่งมอบและตรวจ AC-38 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-108: ส่วน request/approval ของ reschedule; TASK-026 เติม cancellation approval; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-026 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ทำ reschedule request/review โดยเวลารอบเดิมคงมีผลจน owner อนุมัติ ตาม G-13 ไม่ให้ organizer ยืนยันเอง
- [x] ให้ owner ตั้งช่วงยื่น refund พิเศษแยกรอบและเชื่อม eligibility ของ TASK-021; ไม่ขยาย window อัตโนมัติหรือเดาวันจริงจาก fixture
- [x] คง ticket/order/payment identity และใช้ราคาบัตรเดิมของใบที่คืนตาม R2/E2 ไม่คืน customer fee เพียงเพราะเป็น reschedule
- [x] Verification — Unit/integration controlled time: นอก cutoff ปกติแต่ใน special window ยื่นได้ นอกทั้งสองช่วงไม่ได้; organizer ไม่ตั้ง window แทน owner
- [x] Verification — E2E: pending reschedule ยังเห็นเวลาเก่า owner อนุมัติแล้วเห็นเวลาใหม่และ buyer ยื่นใน window พิเศษผ่านเส้นทางเดิม
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Review Evidence

- Mode: final code-review (Subagent)
- Date: 2026-10-21
- Status: approved (moved to done)
- Findings: None (0 blockers, 0 warnings, 0 defects)
- Verification Summary:
  - Unit tests: 24 test files passed, 131 tests passed (`npm run test:unit`)
  - Integration tests: 4/4 passed in `tests/integration/reschedule-refund-window.test.ts` (`npm run test:integration`)
  - E2E tests: 2/2 passed (desktop-chromium 42.6s, mobile-chromium 34.2s) in `tests/e2e/reschedule-refund-window.spec.ts`
  - Typecheck: 0 errors (`npm run typecheck`)
  - Lint: 210 files checked, 0 errors, 0 warnings (`npm run lint`)
  - Standalone build: 37/37 routes built successfully (`npm run build`)
- Contract & Criteria Satisfied:
  - AC-38: Special refund window allows eligible ticket holders to submit refunds past the normal 168h cutoff.
  - AC-108 (part): Pending reschedule amendment keeps original session time until owner approval (G-13).
  - E2 / R2: Refund amount is strictly ticket face value excluding customer service fee.
  - Role isolation: Non-owner actors are rejected when attempting to configure special refund window.
  - Design constraints: Thai language, Kanit typography, zero emojis (pure SVGs only), 60/30/10 palette, mobile responsive.
  - Shared storage: PostgreSQL transaction safety and atomic eligibility evaluation.

## Verification Evidence

1. **Unit Tests (Vitest)**:
   - Command: `npm run test:unit`
   - Result: 24 test files passed, 131 tests passed (including `tests/unit/reschedule-refund-window.test.ts` - 4 tests).
2. **Integration Tests (PostgreSQL integration)**:
   - Command: `npm run test:integration -- tests/integration/reschedule-refund-window.test.ts`
   - Result: 4 passed in 1052ms:
     - `keeps public session time unchanged while reschedule request is pending (AC-108, G-13)`
     - `updates session time to new schedule and configures special refund window upon owner approval (AC-38, AC-108)`
     - `allows refund submission past normal 168h cutoff during active special refund window, and rejects after window closes (AC-38, E2, R2)`
     - `rejects non-owner actors attempting to configure special refund window`
3. **End-to-End Tests (Playwright Chromium & Mobile-Chromium)**:
   - Command: `npx playwright test tests/e2e/reschedule-refund-window.spec.ts`
   - Result: 2 passed in 1.4m (desktop-chromium 40.8s, mobile-chromium 34.2s). Verified complete journey: organizer creates event/session, owner approves, guest purchases ticket; organizer requests reschedule, public continues showing original session time (G-13, AC-108); owner configures special refund window and approves; public page updates to new rescheduled session time (AC-108); guest visits `/my-tickets` during special refund window, sees special refund window notice (AC-38), selects ticket, and submits refund request with pending status and face-value refund amount excluding customer service fee (R2, E2, AC-33).
4. **Typecheck & Linting**:
   - `npm run typecheck`: 0 errors.
   - `npm run lint`: 0 warnings, 0 errors across 210 files.
   - `npm run build`: standalone build succeeded with all 37 routes.
