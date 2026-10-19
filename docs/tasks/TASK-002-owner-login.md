# TASK-002: เจ้าของเว็บเริ่มบัญชีภายในและล็อกอินตามบทบาทได้

- Status: in_progress
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

สร้าง owner คนแรกผ่านขั้นตอนภายใน และให้บัญชีหลังบ้านเข้าสู่ขอบเขตงานของตนด้วยอีเมล/รหัสผ่าน โดยไม่มี public owner signup

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-001 — [เปิดแอป TICKET และตรวจสอบการพัฒนาบน local ได้](TASK-001-local-foundation.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-51 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-54: เส้นทาง login ของ owner/organizer/scanner; TASK-003 เติม password reset; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-003 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] เลือก auth library และวิธี bootstrap ตาม NQ-03 ภายใน ADR-0004; ไม่เพิ่ม login method/MFA หรือสมัคร owner สาธารณะ
- [ ] ทำ login/session/role authorization ที่ตรวจฝั่ง server สำหรับ owner/organizer/scanner และหน้าหลังบ้านขั้นต่ำตาม role; ใช้บัญชี test fixtures เพื่อพิสูจน์ทั้งสาม role โดยไม่เปิด self-signup
- [ ] แยกสิทธิ์รายงาน/งาน/คำสั่งซื้อ/หลักฐานไว้กับ actor และ object ไม่ใช่ซ่อน UI เท่านั้น; ให้ task ผู้เป็นเจ้าของข้อมูลแต่ละชนิดต่อยอดการตรวจ ownership จริง
- [ ] Verification — Integration: internal bootstrap ใช้ได้ แต่ public request ไม่สร้าง owner; login ถูก/ผิด และ role escalation ถูกปฏิเสธ
- [ ] Verification — E2E: owner login เข้าหลังบ้านได้ และ fixture organizer/scanner ไม่ได้ owner actions; ตรวจการคง session และขอบเขตเมื่อเข้าหน้าโดยตรง
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

- [x] Preflight/selection (2026-10-20): TASK-001 done, SPEC-001 ready, ไม่มี active blocker/prototype conflict; AGENTS ยังไม่มี Git repository ใช้งานได้ จึงเก็บ baseline explicit files ใน /tmp/ticket-002-baseline.json ไม่ init/commit/push. Effective unit-test/integration-test/e2e-test/code-review=required จาก CONTEXT, ไม่มี override. เลือก Vitest unit สำหรับ role/object authorization และ bootstrap validation, Vitest integration สำหรับ bootstrap+PostgreSQL sessions/auth HTTP, Playwright E2E สำหรับสาม role/direct page/login persistence/logout. Canonical skills อย่างละหนึ่งใน .agents/skills, runners/config จาก TASK-001 พร้อม; test agents จะรันตามลำดับก่อน final review

- [x] Unit gate รอบแรก: sub-agent `unit_002` รัน `npm run test:unit` (Vitest 5.0.5) ผ่าน 2 files/40 tests; เพิ่มเฉพาะ tests/unit/back-office.test.ts สำหรับ boundary input/origin/ownership ไม่มี writes นอกขอบเขต. Parent แยก next-env.d.ts ที่ Next dev สร้างและ README ที่ parent แก้เองออกจาก agent writes
- [x] บันทึก integration รอบแรก (ไม่ใช่ pass): sub-agent `integration_002`, `npm run test:integration` ใน sandbox พบ EPERM loopback55433; คำสั่งเดิมใช้สิทธิ์ DB/subprocess รันได้ 13 passed/1 failed ที่ foreign Origin คาด403แต่ได้200. Agent เพิ่มเฉพาะ tests/integration/back-office.test.ts (empty-store concurrent bootstrap, credential rollback, CLI stdin success/repeat, fresh role lookup). Expiry assertion ใน test ที่ล้มยังไม่ถึง ไม่ถือว่าผ่าน
- [x] วิเคราะห์/แก้ foreign-Origin regression: source Better Auth create-context ตั้ง skipOriginCheck=true โดย default ใน test mode; ตั้ง disableOriginCheck=false/disableCSRFCheck=false ชัดเจนทุก environment และบังคับ POST Origin เท่ากับ configured BETTER_AUTH_URL ใน auth HTTP boundary (ไม่เชื่อ Host/callback). เพิ่ม absent/null/foreign Origin และยืนยันไม่สร้าง session; ไม่ลด assertion เดิม. Parent แก้ type error ของ CLI test ให้ระบุ NODE_ENV=test ตาม Next ProcessEnv; `npm run typecheck` ผ่านแล้ว ต้องรัน affected unit/integration gates ใหม่ก่อนต่อ E2E
