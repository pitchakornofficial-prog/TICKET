# TASK-007: ลูกค้าค้นหาและเปิดรายละเอียดคอนเสิร์ตได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Guest เข้าหน้าแรก ค้นหางานเปิดเผย และอ่านรายละเอียดรอบ/ประเภท/ราคา/สถานะได้ตามข้อมูลที่อนุมัติ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-006 — [เจ้าของเว็บอนุมัติรอบให้เปิดขายแยกกันได้](TASK-006-session-approval.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-01, AC-03 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ทำ home/search/concert detail จาก approved data พร้อม poster/date/venue/session/type/price และ availability ที่ตรวจสิทธิ์แล้ว
- [ ] แสดง empty result และงาน/รอบที่ยังไม่เปิดขายตามความจริง; public response ไม่มี buyer/order/financial information
- [ ] ใช้ D-02/D-03/D-06–D-09 เป็น visual guidance และคง mandatory theme/font/icons/mobile constraints; ไม่เพิ่ม behavior ตามเว็บอ้างอิงที่ไม่เคยยืนยัน
- [ ] แยกจุดเชื่อม checkout ไป TASK-011/TASK-012 ไม่สร้างการซื้อสำเร็จจำลองใน catalog
- [ ] Verification — Integration: public query ไม่คืน pending/ข้อมูลงานส่วนที่ยังไม่เผยแพร่ และไม่รั่วข้อมูลส่วนตัว
- [ ] Verification — E2E local: home→detail, search ชื่อ seed concert→detail, empty result และเลือกดูสองรอบแยกข้อมูล; ตรวจ mobile layout
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
