# TASK-010: เจ้าของเว็บตั้งค่าบริการและเงินสำรองรายงานได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner ตั้ง mode/rate ค่าบริการทั้งสองฝ่ายและเปอร์เซ็นต์สำรองแยกงานได้ โดยค่าตั้งถูกนำไปใช้กับ quote จริงในงานถัดไป

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#business-rules-and-monetary-contract), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-005 — [ผู้จัดงานบันทึกงาน รอบ และประเภทบัตรของตนได้](TASK-005-event-drafts.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-23, AC-24, AC-25, AC-29 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ทำ owner configuration UI/persistence สำหรับ organizer: เปอร์เซ็นต์/บาทต่อใบ/เหมาจ่าย และ customer: บาทต่อใบ/บาทต่อ order/เปอร์เซ็นต์; ฝ่ายหนึ่งมี effective mode เดียว
- [ ] ทำ reserve percentage per event ตาม F8 และปฏิเสธ organizer/scanner แก้ค่าตั้ง; แสดงค่าที่มีผลโดยไม่เดา business rates จริง
- [ ] เตรียม exact-decimal quotation ตามสูตรสเปกเพื่อ TASK-012 ใช้; organizer fee lock ที่ first reservation และการปรับ live customer quote ปิดครบใน TASK-012/TASK-024
- [ ] ใช้ fixture rates เท่านั้นใน local verification ไม่อ้างว่า owner อนุมัติ rate ตัวอย่างไปใช้งานจริง
- [ ] Verification — Unit/integration: เลือกได้ทุก mode แต่ไม่คิดซ้อนสอง mode ฝ่ายเดียว; ตั้งค่าต่างกันสองงานและตรวจ role denial
- [ ] Verification — E2E: owner เลือก organizer/customer/reserve settings และ reload ได้ค่าตรง; organizer แก้จาก UI/direct action ไม่สำเร็จ
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
