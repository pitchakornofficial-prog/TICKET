# TASK-023: เจ้าของเว็บบันทึกการโอนคืนและหลักฐานส่วนตัวได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner บันทึก manual refund จริงหรือสถานะรอโอน/ล้มเหลวได้ โดย QR/liability ไม่ย้อนผิดและหลักฐานดูได้เฉพาะ owner

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- TASK-022 — [เจ้าของเว็บอนุมัติคืนแล้วเพิกถอน QR และคืนโควตาได้ครั้งเดียว](TASK-022-refund-approval.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-37 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-92: สิทธิ์ไฟล์หลักฐาน refund; TASK-029 เติม payout proof; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-029 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ส่วนร่วม AC-93: manual refund failure/retry/liability; TASK-029 เติม payout failure; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-029 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ทำ owner manual-transfer recording ของ normal/exception refunds: มี completed เมื่อบันทึกการโอนจริง ไม่เรียก bank transfer หรือ Omise refund API
- [ ] เก็บ proof ที่ R2/private boundary ต่อจาก media adapter ใน TASK-005 ด้วย local storage substitute; owner เท่านั้นเปิดไฟล์ได้ buyer/organizer เห็นเพียงยอด/สถานะ scanner ไม่มีสิทธิ์
- [ ] โอนล้มเหลว/ยังไม่โอนให้คง approved/refund-pending liability และ revoked QR; retry/แก้หลักฐาน/กดซ้ำไม่เพิ่ม transfer/หักเงิน/คืน quota ซ้ำ
- [ ] แยกประวัติการแก้หลักฐานออกจากยอดโอนจริง ไม่ใช้การมีไฟล์แทนข้อเท็จจริงว่าเงินโอนสำเร็จ
- [ ] Verification — Integration authorization direct file access/response และ duplicate/failure transfer recording; ไม่มี external bank-transfer/refund call
- [ ] Verification — E2E: owner บันทึกโอน/หลักฐานและเปิดได้ ผู้รับเงินดูยอด/สถานะได้แต่เปิดไฟล์ตรงไม่ได้; failure คงรอโอนและ QR ไม่กลับ valid
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
