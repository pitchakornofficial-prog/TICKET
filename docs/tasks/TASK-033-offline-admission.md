# TASK-033: เครื่องหลักสแกนเข้า ออก และกลับเข้าโดยออฟไลน์ได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

เครื่องหลักใช้ cached ticket ที่มีและบันทึกผลเข้า/ออกอย่างทนต่อ refresh พร้อมสถานะรอซิงก์ โดยไม่ยอมรับข้อมูลที่ยังไม่มี

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-032 — [ผู้จัดงานกำหนดเครื่องหลักและเตรียมข้อมูลออฟไลน์เฉพาะงานได้](TASK-032-offline-primary-dataset.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-40, AC-41, AC-50, AC-96, AC-103 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-42: แสดง connectivity/last sync/pending local results; TASK-034 เติม pending/last-sync หลัง reconnect; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-034 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] รองรับ offline entry/exit/reentry ด้วย state engine จาก TASK-020 และ dataset จาก TASK-032; ใช้เครื่องหลักเดียวทั้งงานพร้อมขั้นตอนหยุดเครื่องอื่นตาม O1
- [ ] บัตรไม่มีใน dataset รวมบัตรเพิ่งซื้อให้รอออนไลน์ ไม่สรุปว่าผ่านหรือเป็นของปลอม; ไม่รับรู้ revocation ใหม่หลังตัดเน็ตโดยไม่มี sync
- [ ] เขียนผลลง local storage ก่อนแสดง success, เก็บลำดับและ pending ให้คงหลัง refresh; storage write failure ต้องไม่อ้างว่าบันทึกสำเร็จ
- [ ] แสดงผลสำเร็จ/ซ้ำ/ไม่ผ่าน/ต้องออนไลน์ด้วย text/icons/semantic colors และสถานะเชื่อมต่อ/last successful sync/pending ไม่พึ่งสีอย่างเดียว
- [ ] Verification — Unit/integration offline state matrix และ storage failure: valid cached→entry/exit/reentry, repeat in/out, missing/new/revoked-at-snapshot ticket
- [ ] Verification — E2E + device/camera walkthrough: ตัดเครือข่ายบน primary เครื่องเดียว สแกนสาม transitions แล้ว reload ยังมีผล/pending; เครื่องอื่นหยุดตามขั้นตอนและไม่อ้าง cross-device consistency
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
