# TASK-009: ผู้จัดงานเพิ่มทีมสแกนเฉพาะงานได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer จัดบัญชี scanner และขอบเขตงานตนได้ โดย scanner ไม่กลายเป็นผู้ดูแลหรือเห็นงานอื่น

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-005 — [ผู้จัดงานบันทึกงาน รอบ และประเภทบัตรของตนได้](TASK-005-event-drafts.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-09 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ทำ scanner account assignment ของงานตนโดยใช้ role/login จาก TASK-002 และวิธีเริ่ม credential ภายใน ADR-0004
- [ ] บังคับ event-scoped authorization ที่การอ่าน/ทำรายการจริง รวมปฏิเสธงาน organizer อื่นและ owner actions
- [ ] ทำหน้าจัดทีม/หน้าทีมเริ่มต้นให้พร้อมต่อ scanner workflow โดยยังไม่สร้าง manual admission override
- [ ] Verification — Integration: organizer A เพิ่มทีมให้ B ไม่ได้ scanner งาน A ไม่อ่าน/ทำ scan ใน B แม้ยิง direct request
- [ ] Verification — E2E: เพิ่ม scanner ให้ event หนึ่ง login เป็น scanner แล้วเห็นเฉพาะงานที่ได้รับสิทธิ์
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
