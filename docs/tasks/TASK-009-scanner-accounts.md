# TASK-009: ผู้จัดงานเพิ่มทีมสแกนเฉพาะงานได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer จัดบัญชี scanner และขอบเขตงานตนได้ โดย scanner ไม่กลายเป็นผู้ดูแลหรือเห็นงานอื่น

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-005 — [ผู้จัดงานบันทึกงาน รอบ และประเภทบัตรของตนได้](TASK-005-event-drafts.md)

## Todo

- [x] ส่งมอบและตรวจ AC-09 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ทำ scanner account assignment ของงานตนโดยใช้ role/login จาก TASK-002 และวิธีเริ่ม credential ภายใน ADR-0004
- [x] บังคับ event-scoped authorization ที่การอ่าน/ทำรายการจริง รวมปฏิเสธงาน organizer อื่นและ owner actions
- [x] ทำหน้าจัดทีม/หน้าทีมเริ่มต้นให้พร้อมต่อ scanner workflow โดยยังไม่สร้าง manual admission override
- [x] Verification — Integration: organizer A เพิ่มทีมให้ B ไม่ได้ scanner งาน A ไม่อ่าน/ทำ scan ใน B แม้ยิง direct request (`npm run test:integration` ผ่าน 29/29 tests ครอบคลุม `tests/integration/scanner.test.ts`)
- [x] Verification — E2E: เพิ่ม scanner ให้ event หนึ่ง login เป็น scanner แล้วเห็นเฉพาะงานที่ได้รับสิทธิ์ (`npx playwright test` ผ่าน 36/36 tests ครอบคลุม `tests/e2e/scanner-accounts.spec.ts` ทั้ง desktop-chromium และ mobile-chromium)
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง:
  - `npm run typecheck` — 0 errors
  - `npm run lint` — 0 warnings, 0 errors
  - `npm run test:unit` — 53/53 passed (รวม `tests/unit/scanner.test.ts` 4 tests)
  - `npm run test:integration` — 29/29 passed (รวม `tests/integration/scanner.test.ts` 1 test)
  - `npx playwright test` — 36/36 passed (รวม `tests/e2e/scanner-accounts.spec.ts` 2 tests desktop + mobile)
  - `npm run build` — standalone build success
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] Review approved — working tree against HEAD; AC-09 verified (organizer event-scoped scanner assignment, scanner role isolation without owner/cross-event privileges); typecheck, lint, unit tests (53 passed), integration tests (29 passed), e2e tests (36 passed across desktop and mobile chromium), and build passed; no findings.
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow (เตรียม focused diff สำหรับ TASK-009 แล้ว)
