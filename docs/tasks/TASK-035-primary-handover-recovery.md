# TASK-035: สลับเครื่องหลักเมื่อซิงก์ครบและหยุดออฟไลน์เมื่อข้อมูลหายได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer สลับ primary ได้เฉพาะออนไลน์หลังเครื่องเก่าส่งผลครบและเครื่องใหม่พร้อม dataset ล่าสุด ส่วนเครื่องเสีย/ข้อมูลหายต้องหยุดเพื่อกระทบยอด

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-034 — [ผลออฟไลน์ซิงก์กลับครั้งเดียวและแจ้งข้อมูลขัดแย้งได้](TASK-034-offline-sync-conflicts.md)

## Todo

- [x] ส่งมอบและตรวจ AC-97, AC-98 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ทำ handover readiness UI/server boundary ที่ตรวจ online/old pending=0/new latest sync และ primary uniqueness แบบ atomic
- [x] ปฏิเสธ handover เมื่อ offline/มี old pending/new data ไม่พร้อม และ retryไม่สร้างหลาย primary
- [x] ถ้าเครื่องหลักเสีย/ข้อมูล local หายพร้อมผลค้าง ให้แสดงหยุด offline และขั้นตอน owner กระทบยอดตาม NQ-06; ไม่สร้างข้อมูลที่สูญหายขึ้นเองหรือเปิดเครื่อง offline ใหม่ข้าม gate
- [x] Verification — Integration/E2E matrix ทั้งสาม readiness conditions และ concurrent handover; หลังสำเร็จมี primary เดียวและข้อมูลใหม่พร้อม
- [x] Verification — Device walkthrough เครื่องเสีย/ล้าง local pending: ไม่มีการ bypass หรืออ้างว่ากู้ประวัติที่ไม่มีได้ และจดขั้นตอนกระทบยอดที่ใช้จริง
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน (Code review approved: AC-97, AC-98, NQ-06, G-43, AC-65 passed with 0 findings)
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

- Unit tests (`npm run test:unit`): 176 passed across 34 test files (รวม 4 tests ใน `tests/unit/primary-handover-recovery.test.ts`)
- Integration tests (`npm run test:integration tests/integration/primary-handover-recovery.test.ts`): 3 passed กับ PostgreSQL จริง
- E2E tests (`npx playwright test tests/e2e/primary-handover-recovery.spec.ts`): 2 passed across desktop-chromium and mobile-chromium
- Lint (`npm run lint`): Biome 0 errors, 0 warnings across 267 files
- Typecheck (`npm run typecheck`): 0 errors
- Standalone build (`npm run build`): สำเร็จเรียบร้อยครบ 39 routes
- Code Review (Final Mode): Approved — ตรวจสอบครบตาม AC-97, AC-98, NQ-06, G-43, AC-65; ข้อมูล PII ไม่รั่วไหล; UI ใช้ Kanit, Pure SVG ไม่มี emoji, 60/30/10 palette; การสลับเครื่องหลักและระงับฉุกเฉินทำงานระดับ atomic transaction ใน PostgreSQL
