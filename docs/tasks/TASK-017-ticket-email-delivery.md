# TASK-017: ผู้ซื้อได้รับอีเมลบัตรและติดตามการส่งที่ล้มเหลวได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

บัตรที่ออกแล้วถูกส่งพร้อมลิงก์ order ทางอีเมล และ delivery failure/retry ไม่เปลี่ยน paid หรือ QR เดิม

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- TASK-015 — [ชำระสำเร็จที่ตรวจแล้วออก QR แยกใบได้](TASK-015-paid-ticket-issuance.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-20 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-75: ส่วนส่งไม่สำเร็จ/retry คง paid/QR; TASK-018 เติม lookup recovery; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-018 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ใช้ Resend/test transport ร่วม TASK-003 ส่ง QR tickets และ order link ที่ผูก order ของผู้ซื้อเท่านั้น
- [ ] แยก delivery status/หลักฐานการส่งออกจาก payment/issuance ไม่อ้างว่าส่งถึงเพียงเพราะรับคำขอ; owner ติดตามงานส่งไม่สำเร็จได้
- [ ] retry งานที่ยังขาดโดยไม่ issue ticket หรือรับเงินซ้ำ; ไม่มีการส่ง OTP/ตั๋วจริงหาผู้อื่นใน local tests และไม่เปลี่ยน provider
- [ ] Verification — Integration email capture: เนื้อหา/QR/link ตรงกับ issued order; ส่งล้มเหลวแล้ว retry ใช้ ticket IDs/paid reference เดิม
- [ ] Verification — E2E: เปิดอีเมลทดสอบของ order ที่ paid และตรวจ delivery error ที่แยกจาก issued state; recovery ทาง lookup ปิดร่วม TASK-018
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
