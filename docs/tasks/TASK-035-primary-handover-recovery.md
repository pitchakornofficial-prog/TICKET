# TASK-035: สลับเครื่องหลักเมื่อซิงก์ครบและหยุดออฟไลน์เมื่อข้อมูลหายได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer สลับ primary ได้เฉพาะออนไลน์หลังเครื่องเก่าส่งผลครบและเครื่องใหม่พร้อม dataset ล่าสุด ส่วนเครื่องเสีย/ข้อมูลหายต้องหยุดเพื่อกระทบยอด

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-034 — [ผลออฟไลน์ซิงก์กลับครั้งเดียวและแจ้งข้อมูลขัดแย้งได้](TASK-034-offline-sync-conflicts.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-97, AC-98 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ทำ handover readiness UI/server boundary ที่ตรวจ online/old pending=0/new latest sync และ primary uniqueness แบบ atomic
- [ ] ปฏิเสธ handover เมื่อ offline/มี old pending/new data ไม่พร้อม และ retryไม่สร้างหลาย primary
- [ ] ถ้าเครื่องหลักเสีย/ข้อมูล local หายพร้อมผลค้าง ให้แสดงหยุด offline และขั้นตอน owner กระทบยอดตาม NQ-06; ไม่สร้างข้อมูลที่สูญหายขึ้นเองหรือเปิดเครื่อง offline ใหม่ข้าม gate
- [ ] Verification — Integration/E2E matrix ทั้งสาม readiness conditions และ concurrent handover; หลังสำเร็จมี primary เดียวและข้อมูลใหม่พร้อม
- [ ] Verification — Device walkthrough เครื่องเสีย/ล้าง local pending: ไม่มีการ bypass หรืออ้างว่ากู้ประวัติที่ไม่มีได้ และจดขั้นตอนกระทบยอดที่ใช้จริง
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
