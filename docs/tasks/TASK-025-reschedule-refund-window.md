# TASK-025: เลื่อนรอบโดยอนุมัติและเปิดช่วงคืนพิเศษได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer ขอเลื่อนรอบและ owner ทำให้เวลาใหม่มีผลพร้อมกำหนด special refund window ซึ่งยื่นคืนได้แม้พ้น cutoff ปกติ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-024 — [การแก้รอบที่เปิดขายมีผลเมื่ออนุมัติและรักษาสิทธิ์เดิม](TASK-024-approved-live-edits.md)
- TASK-021 — [ลูกค้ายื่นคืนบางใบที่เข้าเงื่อนไขได้](TASK-021-refund-requests.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-38 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-108: ส่วน request/approval ของ reschedule; TASK-026 เติม cancellation approval; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-026 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ทำ reschedule request/review โดยเวลารอบเดิมคงมีผลจน owner อนุมัติ ตาม G-13 ไม่ให้ organizer ยืนยันเอง
- [ ] ให้ owner ตั้งช่วงยื่น refund พิเศษแยกรอบและเชื่อม eligibility ของ TASK-021; ไม่ขยาย window อัตโนมัติหรือเดาวันจริงจาก fixture
- [ ] คง ticket/order/payment identity และใช้ราคาบัตรเดิมของใบที่คืนตาม R2/E2 ไม่คืน customer fee เพียงเพราะเป็น reschedule
- [ ] Verification — Unit/integration controlled time: นอก cutoff ปกติแต่ใน special window ยื่นได้ นอกทั้งสองช่วงไม่ได้; organizer ไม่ตั้ง window แทน owner
- [ ] Verification — E2E: pending reschedule ยังเห็นเวลาเก่า owner อนุมัติแล้วเห็นเวลาใหม่และ buyer ยื่นใน window พิเศษผ่านเส้นทางเดิม
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
