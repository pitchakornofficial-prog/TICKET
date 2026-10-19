# TASK-011: ลูกค้ากรอกข้อมูลและยืนยันอีเมลโดยไม่สมัครสมาชิกได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Guest กรอกชื่อ อีเมล เบอร์โทร และผ่าน OTP ก่อนเริ่มกันบัตร โดยการส่งซ้ำ/ลองผิดถูกควบคุมตามค่าที่มอบหมายแล้ว

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-007 — [ลูกค้าค้นหาและเปิดรายละเอียดคอนเสิร์ตได้](TASK-007-public-concert-catalog.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-57, AC-58, AC-59, AC-60 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ทำ buyer details/OTP UI โดยใช้ Resend/test transport จาก TASK-003 ไม่มี customer account creation และยังไม่กัน stock ก่อน OTP ผ่าน
- [ ] ใช้รหัสสุ่ม 6 หลัก 5 นาที one-use ผูก email/purpose/request; resend 60 วินาที สูงสุด 5/15 นาที รหัสใหม่ยกเลิกเก่า
- [ ] ผิดครบ 5/15 นาทีให้พัก 15 นาทีตาม email/purpose และ counter ไม่ reset ด้วยการขอรหัสใหม่; ใช้ shared store ตาม ADR-0004
- [ ] กำหนดรายละเอียดภายในของ verified-session ตาม NQ-06 โดยบันทึกว่าเป็น implementation choice ไม่ใช่คำตอบใหม่ และไม่เปลี่ยนวิธียืนยันตัวตน
- [ ] Verification — Unit/integration controlled clock: expiry/replay/scope/resend/fail-limit ทั้ง request ใหม่และคนละ connection; ข้อมูลบังคับขาดแต่ละค่าไม่ผ่าน
- [ ] Verification — E2E: guest กรอกครบ รับ OTP จาก local inbox ยืนยันได้; wrong/expired/rate-limited path มีสถานะตามจริงและยังไม่เริ่ม reservation
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
