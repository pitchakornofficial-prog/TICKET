# TASK-014: ลูกค้าสร้าง QR ชำระ order เดิมได้อย่างถูกต้อง

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Order ที่ผ่าน OTP/ยืนยัน reservation มี Omise PromptPay QR ตรงยอด/THB และกดซ้ำแล้วใช้ order/deadline เดิม

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- TASK-013 — [reservation หมดเวลาแล้วคืนโควตาโดยไม่ต่ออายุได้](TASK-013-reservation-expiry.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-15, AC-26 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-12: ปฏิเสธ direct payment request ที่ OTP ยังไม่ผ่าน ร่วม reservation gate ของ TASK-012; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-012 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ส่วนร่วม AC-13: บังคับ reservation เริ่มแล้วก่อน QR ร่วม TASK-012; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-012 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ส่วนร่วม AC-70: ใช้ order/remaining time เดิมสำหรับ payment/QR ร่วม TASK-013; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-013 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ตรวจ official Omise contract สำหรับ QR/reference/amount/currency/expiry และ field/precision ของ actual success time ก่อนผูก integration; บันทึกหลักฐานตาม NQ-05 ไม่ใช้เวลามาถึง callback แทน
- [ ] เชื่อมสร้าง QR ตาม ADR-0003 พร้อม local provider test double ที่เก็บ reference/order/ยอด/THB และไม่สร้างธุรกรรมเพิ่มจากการกดซ้ำ; UI แสดง quote/deadline ที่ยืนยันแล้ว
- [ ] ปฏิเสธ payment request ที่ OTP/reservation ไม่ผ่าน หมดอายุ หรือ order ไม่ใช่ของผู้ขอ; แยก QR displayed/pending ออกจาก verified paid
- [ ] หาก contract สำคัญพิสูจน์ไม่ได้ให้บล็อก boundary นั้นพร้อมเงื่อนไขปลดบล็อก ไม่แต่ง success time หรือเปลี่ยน provider; merchant/domain readiness ไม่จำเป็นต่อ local double แต่ต้องพร้อมก่อน production
- [ ] Verification — Integration contract tests: QR เชื่อม order/amount/currency/expiry ตรงกัน และ repeated creation ไม่เพิ่ม payment/reference โดยไม่ตั้งใจ
- [ ] Verification — E2E local: verified reservation→payment QR, refresh/repeated action คงเวลา และ request ที่ข้าม guard ถูกปฏิเสธ; ไม่สร้าง charge/ชำระเงินจริง
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
