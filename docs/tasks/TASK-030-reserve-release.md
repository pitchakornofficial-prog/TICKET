# TASK-030: เจ้าของเว็บปล่อยเงินสำรองหลังรอบสุดท้ายสิ้นสุดได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner ตรวจและปล่อย reserve ที่กันได้จริงหลังรอบสุดท้ายของงานจบ โดยไม่ปล่อยตาม timer หรือสร้างยอดเกินเงินคงเหลือ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#settlement-and-reserve-invariants), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-028 — [ผู้จัดงานอ่านยอดขาย ค่าบริการ และยอดพร้อมจ่ายของงานตนได้](TASK-028-organizer-money-report.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-83 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ทำ owner reserve review/release ที่ใช้วันสิ้นสุดรอบสุดท้ายทั้งงานและข้อมูล E/P/X/U/H จาก report ไม่ใช่แค่รอบแรกจบ
- [ ] เพิ่ม U เฉพาะยอดที่ owner สั่งปล่อยได้จริง ไม่เกิน actual held และไม่เพิ่มซ้ำเมื่อ retry; reserve target เปลี่ยนตาม approved refunds โดยไม่สร้าง held ติดลบ
- [ ] แสดง held/payable หลังปล่อยโดยไม่สั่ง bank payout อัตโนมัติ; การโอนเงินไปผู้จัดงานยังเป็น TASK-029
- [ ] Verification — Unit/integration clock/authorization: ก่อนรอบสุดท้ายจบ/หลังจบ/owner ยังไม่สั่ง/role อื่น/duplicate action
- [ ] Verification — E2E report: E900/P810/H90 ก่อนปล่อยพร้อมจ่าย0 หลัง final session และ owner ปล่อย90 H0 พร้อมจ่าย90; ไม่มีเงินคงเหลือไม่สร้างยอดปล่อยใหม่
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
