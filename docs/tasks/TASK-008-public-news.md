# TASK-008: เจ้าของเว็บเผยแพร่ข่าวให้ลูกค้าอ่านได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner จัดการข่าวและ guest เปิดรายการ/รายละเอียดข่าวที่เผยแพร่ได้

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-002 — [เจ้าของเว็บเริ่มบัญชีภายในและล็อกอินตามบทบาทได้](TASK-002-owner-login.md)

## Todo

- [x] ส่งมอบและตรวจ AC-04 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ทำ owner news management/publish และ public news list/detail ในแอปเดียว; ไม่ขยาย role organizer/scanner ให้เผยแพร่ข่าว
- [x] แยก draft/ไม่มีข่าว/เผยแพร่แล้วและปฏิเสธการเข้าข่าวที่ยังไม่เผยแพร่โดยตรง
- [x] ใช้ UI ที่อ่านภาษาไทยได้ตาม theme/device constraints และไม่เพิ่ม workflow โฆษณาหรือ analytics จากตัวอย่างเว็บ
- [x] Verification — Integration authorization: owner publish ได้ role อื่นไม่ได้ และ public ไม่อ่าน draft (`npm run test:integration` ผ่าน 28/28 tests ครอบคลุม `tests/integration/news.test.ts`)
- [x] Verification — E2E: owner สร้าง/เผยแพร่ข่าวแล้ว guest เปิดอ่านตรงเนื้อหา; ตรวจรายการว่างและหน้ามือถือ (`npx playwright test` ผ่าน 34/34 tests ครอบคลุม `tests/e2e/news.spec.ts` ทั้ง desktop-chromium และ mobile-chromium)
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง:
  - `npm run typecheck` — 0 errors
  - `npm run lint` — 0 warnings, 0 errors
  - `npm run test:unit` — 49/49 passed
  - `npm run test:integration` — 28/28 passed
  - `npx playwright test` — 34/34 passed
  - `npm run build` — standalone build success
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] Review approved — working tree against `origin/deploy`; AC-04 verified; typecheck, lint, test:unit (49/49), test:integration (28/28), playwright e2e (34/34), and build passed; no findings.
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow (เตรียม focused diff สำหรับ TASK-008 แล้ว)
