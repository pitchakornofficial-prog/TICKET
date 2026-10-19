# TASK-028: ผู้จัดงานอ่านยอดขาย ค่าบริการ และยอดพร้อมจ่ายของงานตนได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

รายงานเฉพาะ organizer คำนวณ E/F/L/reserve ตามสูตรสเปกจาก actual order/refund states และแสดงข้อมูลผู้ซื้อแบบปิด contact

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#business-rules-and-monetary-contract), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-026 — [ยกเลิกรอบแล้วสร้างรายการรอคืนสำหรับบัตรที่เข้าเกณฑ์ได้](TASK-026-cancel-issued-session.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-28, AC-64, AC-77, AC-78, AC-80, AC-81, AC-82, AC-110 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-07: ส่วน report ownership ร่วม TASK-005 ที่ตรวจ event read/write; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-005 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ส่วนร่วม AC-84: report basis/withheld unissued funds และไม่หัก refund ซ้ำ; TASK-027 สร้าง pending-cancel financial states จริง; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-027 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ทำ owner/organizer event report พร้อม ticket sales, organizer fees, approved refund deductions, reserve/paid/payable และรายการอธิบายยอด ไม่เพิ่ม report export ที่ไม่ได้อยู่ในสเปก
- [ ] คำนวณ F_o ต่อ order แล้วรวม F; partial refund recompute order เดิมและปรับด้วยส่วนต่าง; flat K หนึ่งครั้งทั้งงานคงเต็มแม้ cancel และไม่เก็บเต็มใหม่แต่ละ session
- [ ] ใช้ E=sum(V_o)-F, L=E-P+X และ reserve target/outstanding/actual held/payable ตามสเปก; ใช้ actual issued/approved/cancelled-ticket states และ controlled P/X/U/unissued-case fixtures สำหรับ producer boundaries ที่ยังไม่เกิดใน session นี้
- [ ] provider processing fee เป็น owner cost ไม่หักเพิ่มผู้จัดงาน/ลูกค้า; provider-confirmed issued-ticket basis ไม่ต้องรอ bank settlement และ unissued refund funds แยกจาก entitlement/ไม่หัก refund ซ้ำจากยอดอื่น
- [ ] Organizer เห็น order/name ของงานตนแต่ email/phone partially masked ทั้ง response/UI; งานอื่น/financial proof/contacts เต็มถูกปฏิเสธ
- [ ] Verification — Unit exact-decimal fixtures: สอง order 100.10 ที่ 5% รวม 10.02, partial fee 5.01→2.50 ส่วนต่าง 2.51, E=900 target=90 payable=810 และ E=450/P=810 debt=360/held=0
- [ ] Verification — Integration report กับ actual issued/approved/cancelled-ticket states และ unissued-case fixtures: ไม่ double-deduct/ไม่ให้ unissued เงินคืนเต็มหรือ face-only เข้า payable; E2E organizer A อ่านงาน B ไม่ได้ และ inspect masked responses; AC-84 ปิดร่วม producer TASK-027
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
