# TASK-006: เจ้าของเว็บอนุมัติรอบให้เปิดขายแยกกันได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer ส่งรอบให้ owner พิจารณา และรอบที่อนุมัติแล้วขายได้โดยไม่รอรอบอื่น

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-005 — [ผู้จัดงานบันทึกงาน รอบ และประเภทบัตรของตนได้](TASK-005-event-drafts.md)

## Todo

- [x] ส่งมอบและตรวจ AC-02, AC-05, AC-66 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ทำ submit/review/approval UI และ server authorization แยก session; organizer ไม่อนุมัติงานตนเอง
- [x] เผยเฉพาะข้อมูลที่อนุมัติผ่าน public boundary; รอบ pending ไม่ถูกเปิดขายจาก direct request หรือเปลี่ยน URL
- [x] เก็บ approved state ที่ catalog/checkout ใช้เป็นเงื่อนไขเดียวกัน; pending live edits และการเลื่อน/ยกเลิกเป็นงาน TASK-024–TASK-027
- [x] Verification — Integration authorization: approve โดย owner เท่านั้น และ public/checkout predicate แยก approved/pending sessions (tests/integration/session-approval.test.ts ผ่าน)
- [x] Verification — E2E: ส่งสองรอบ อนุมัติหนึ่งรอบ แล้วเห็นรอบที่เปิดขายได้โดยไม่ต้องอนุมัติอีก sibling (tests/e2e/session-approval.spec.ts ผ่าน)
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง (44 unit, 25 integration, 26 e2e tests ผ่าน 100%)
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน (Approved)
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
