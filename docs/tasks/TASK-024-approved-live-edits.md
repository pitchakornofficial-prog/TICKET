# TASK-024: การแก้รอบที่เปิดขายมีผลเมื่ออนุมัติและรักษาสิทธิ์เดิม

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer ส่งราคา/เวลา/quota ฉบับใหม่ให้ owner อนุมัติได้ โดย quote เดิมไม่เปลี่ยนและจำนวนใหม่ไม่ทำสิทธิ์สูญหาย

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-015 — [ชำระสำเร็จที่ตรวจแล้วออก QR แยกใบได้](TASK-015-paid-ticket-issuance.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-67, AC-68, AC-109 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ทำ pending amendment/review/approve สำหรับ live session โดยยังแสดง/ใช้ approved version เดิมระหว่างรอ ตาม G-12
- [ ] เมื่ออนุมัติราคา/customer fee ใหม่ ให้ reservation เดิมคง quote ตลอด 15 นาที แต่การเริ่ม order ใหม่ใช้ค่าที่มีผลใหม่; ไม่ปลดล็อก organizer fee ตาม G-49
- [ ] ปฏิเสธ quota ใหม่ที่ต่ำกว่า issued/active-reserved rights แบบ atomic กับ reserve/issue ไม่ลบสิทธิ์เดิมหรือทำ quota ติดลบ
- [ ] การขอเลื่อน/ยกเลิกทั้งรอบและ special refund window อยู่ TASK-025/TASK-026 ไม่ตีความการแก้ข้อมูลเป็นอนุมัติยกเลิกเอง
- [ ] Verification — Integration version/time: pending→approved ราคา/เวลา/จำนวน public ใช้ version ถูกต้อง active quote คงเดิม
- [ ] Verification — PostgreSQL concurrent quantity edit/reserve/issue และ E2E owner approval ระหว่าง checkout; ตรวจยอด QR/order เดิมไม่เปลี่ยน
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
