# TASK-004: เจ้าของเว็บเชิญผู้จัดงานเข้าระบบได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner ส่งคำเชิญ organizer และผู้รับเริ่มบัญชีได้ตามสิทธิ์ โดยไม่มี organizer self-signup

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-003 — [บัญชีหลังบ้านตั้งรหัสผ่านใหม่ทางอีเมลได้](TASK-003-password-reset.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-52, AC-53 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ทำ owner invitation UI/การส่งลิงก์ทาง transport จาก TASK-003 และการรับคำเชิญ; organizer ไม่เชิญตนเองหรือยกระดับ role เป็น owner
- [ ] คำเชิญใช้ได้ครั้งเดียว อายุ 48 ชั่วโมง และ reissue ทำลิงก์เก่าของคำเชิญเดียวกันใช้ไม่ได้ตาม ADR-0004
- [ ] ใช้ auth/role boundary จาก TASK-002 และบันทึกความเป็นเจ้าของ organizer ที่งานฝากขายถัดไปอ้างอิงได้
- [ ] Verification — Unit/integration ควบคุมเวลาและ role: valid/expired/used/replaced invitation และ public self-signup bypass
- [ ] Verification — E2E: owner ส่งคำเชิญใน test inbox ผู้รับตั้งบัญชีและ login เป็น organizer ได้โดยไม่มี owner privilege
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
