# TASK-018: ผู้ซื้อค้นหาและเปิดบัตรของตนหลัง OTP ได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Guest ค้นหาด้วย email+phone ที่ตรงกันแล้ว OTP เพื่อเปิด order/ticket ตน รวมถึงกลับจากลิงก์อีเมลและกรณีส่งบัตรไม่สำเร็จ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-017 — [ผู้ซื้อได้รับอีเมลบัตรและติดตามการส่งที่ล้มเหลวได้](TASK-017-ticket-email-delivery.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-22, AC-62, AC-63 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-21: ส่วนเปิด order/ticket ของตน; TASK-021 เติมเริ่มคำขอ refund; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-021 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ส่วนร่วม AC-75: ส่วน lookup recovery หลัง delivery failure ร่วม TASK-017; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-017 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ทำ purchased-ticket lookup โดยต้อง email/phone ตรง order ทั้งสองค่าและผ่าน OTP ก่อนรายละเอียด; ไม่ใช้ข้อมูลนี้เป็น public catalog search
- [ ] order link ไม่ข้าม OTP ถ้า session ยังไม่ยืนยัน และ direct order ID/เปลี่ยน email/session ไม่ให้เข้าของคนอื่น
- [ ] ใช้ session TTL/details ที่บันทึกจาก NQ-06 โดยไม่เพิ่ม customer signup; order view แสดง paid/issued/refund/delivery ตามจริงและ QR เดิม
- [ ] เชื่อมจุดเริ่ม refund ไปขอบเขต TASK-021 โดย task นี้ไม่อ้างว่ามี eligibility/approval ที่ยังไม่ทำ
- [ ] Verification — Authorization integration: matching/mismatching pair, expired/unverified session, link possession, cross-email/order tampering
- [ ] Verification — E2E: lookup→OTP→order/QR และ order link→OTP; จำลอง delivery failure จาก TASK-017 แต่ OTP ส่งได้ แล้วเห็น ticket เดิมโดยไม่สร้างใหม่
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
