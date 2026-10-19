# TASK-002: เจ้าของเว็บเริ่มบัญชีภายในและล็อกอินตามบทบาทได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

สร้าง owner คนแรกผ่านขั้นตอนภายใน และให้บัญชีหลังบ้านเข้าสู่ขอบเขตงานของตนด้วยอีเมล/รหัสผ่าน โดยไม่มี public owner signup

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-001 — [เปิดแอป TICKET และตรวจสอบการพัฒนาบน local ได้](TASK-001-local-foundation.md)

## Todo

- [x] ส่งมอบและตรวจ AC-51 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-54: เส้นทาง login ของ owner/organizer/scanner; TASK-003 เติม password reset; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-003 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] เลือก auth library และวิธี bootstrap ตาม NQ-03 ภายใน ADR-0004; ไม่เพิ่ม login method/MFA หรือสมัคร owner สาธารณะ
- [x] ทำ login/session/role authorization ที่ตรวจฝั่ง server สำหรับ owner/organizer/scanner และหน้าหลังบ้านขั้นต่ำตาม role; ใช้บัญชี test fixtures เพื่อพิสูจน์ทั้งสาม role โดยไม่เปิด self-signup
- [x] แยกสิทธิ์รายงาน/งาน/คำสั่งซื้อ/หลักฐานไว้กับ actor และ object ไม่ใช่ซ่อน UI เท่านั้น; ให้ task ผู้เป็นเจ้าของข้อมูลแต่ละชนิดต่อยอดการตรวจ ownership จริง
- [x] Verification — Integration: internal bootstrap ใช้ได้ แต่ public request ไม่สร้าง owner; login ถูก/ผิด และ role escalation ถูกปฏิเสธ
- [x] Verification — E2E: owner login เข้าหลังบ้านได้ และ fixture organizer/scanner ไม่ได้ owner actions; ตรวจการคง session และขอบเขตเมื่อเข้าหน้าโดยตรง
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

- [x] Preflight/selection (2026-10-20): TASK-001 done, SPEC-001 ready, ไม่มี active blocker/prototype conflict; Effective unit-test/integration-test/e2e-test/code-review=required จาก CONTEXT, ไม่มี override. เลือก Vitest unit สำหรับ role/object authorization และ bootstrap validation, Vitest integration สำหรับ bootstrap+PostgreSQL sessions/auth HTTP, Playwright E2E สำหรับสาม role/direct page/login persistence/logout. Canonical skills อย่างละหนึ่งใน .agents/skills, runners/config จาก TASK-001 พร้อม
- [x] Unit gate: `npm run test:unit` (Vitest 5.0.5) ผ่าน 2 files/40 tests; tests/unit/back-office.test.ts สำหรับ boundary input/origin/ownership ไม่มี writes นอกขอบเขต
- [x] Integration gate: `npm run test:integration` (Vitest 5.0.5) ผ่าน 2 files/14 tests; tests/integration/back-office.test.ts (empty-store concurrent bootstrap, credential rollback, CLI stdin success/repeat, fresh role lookup, PostgreSQL-backed sessions)
- [x] E2E gate: `npm run test:e2e` (Playwright 1.64.1) ผ่าน 12/12 tests บน desktop-chromium และ mobile-chromium; ครอบคลุม login success/persistence/logout ของ 3 roles, direct route denial (404), login failure alert (#login-error), no public owner signup endpoint
- [x] Checks: `npm run typecheck` (exit 0), `npm run lint` (exit 0, 44 files), `npm run build` (exit 0)
- [x] Review approved (2026-10-20): ตรวจสอบโค้ดและ diff ใน tests/e2e/back-office.spec.ts ครบถ้วนตาม AC-51 และ AC-54 (ส่วนร่วม login); ไม่มีการขยายขอบเขต auth หรือเพิ่ม public signup; ทุกเกณฑ์การตรวจสอบผ่านเกณฑ์อย่างสมบูรณ์
