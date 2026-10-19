# TASK-031: ยอดติดลบและเงินรับคืนจากผู้จัดงานอยู่เฉพาะงานเดิมได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner/organizer เห็นยอดค้างจาก refund หลัง payout ของงานเดิม และ owner บันทึกรับคืนจริงโดยไม่หักข้ามงาน

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#settlement-and-reserve-invariants), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-029 — [เจ้าของเว็บจ่ายรายสัปดาห์และบันทึกหลักฐานโดยไม่จ่ายยอดเดิมซ้ำได้](TASK-029-weekly-manual-payout.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-85, AC-86 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] รายงาน L ติดลบแยกเหตุจาก flat fee carry/ยอดเกินจ่ายจาก refund ตามสเปก; หักเฉพาะรายรับถัดไปของ event เดิม ไม่แตะอีกงานของ organizer เดียวกัน
- [ ] เมื่อไม่มี payout ถัดไปให้แสดง receivable งานเดิมเพื่อ owner ติดตาม; เพิ่ม X เมื่อตรวจ/บันทึกรับเงินจริง ไม่ตัดหนี้จากการสร้างรายการติดตาม
- [ ] ป้องกัน duplicate repayment record ไม่ลดหนี้/เพิ่ม payable ซ้ำและไม่ทำให้แก้ประวัติ paid/refund ย้อนหลัง
- [ ] Verification — Unit/accounting integration สอง event organizer เดียวกัน: E450/P810/X0 ได้ debt360, B ไม่ถูกหัก; บันทึก X360 แล้ว L0 และ retry ไม่เปลี่ยนอีก
- [ ] Verification — E2E owner บันทึกรับคืนและ organizer อ่านยอดงานตนพร้อมสถานะได้โดยไม่เห็นงานอื่น/หลักฐานที่ไม่มีสิทธิ์
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
