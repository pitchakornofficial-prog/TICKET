# TASK-015: ชำระสำเร็จที่ตรวจแล้วออก QR แยกใบได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

ผลชำระที่ provider ตรวจตรง order/ยอด/เวลา ทำให้ guest ได้ ticket ครบจำนวนเพียงครั้งเดียวในรอบที่ไม่ยกเลิก

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- TASK-014 — [ลูกค้าสร้าง QR ชำระ order เดิมได้อย่างถูกต้อง](TASK-014-payment-qr.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-11, AC-16, AC-17, AC-18, AC-19 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-06: การเปลี่ยน reserved→issued ไม่กระทบรอบอื่น ร่วม TASK-012; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-012 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ตรวจผลกับ provider และจับคู่ order/ยอด/THB/actual success time; QR displayed/redirect/ผลปลอมไม่ใช่ paid
- [ ] ทำ paid→issue ครบจำนวนแบบ atomic/idempotent และ QR เฉพาะใบ ใช้ข้อมูลผู้ซื้อเดียว; ไม่ออก partial order หรือชื่อผู้เข้าแยกใบ
- [ ] รองรับ duplicate/out-of-order callback และ retry หลัง process หยุดบางขั้นโดยไม่เพิ่ม ticket/ยอดรับหรือย้อน paid เป็น unpaid; กรณี expiry/late recovery เป็น TASK-016
- [ ] ทำหน้าผลชำระ/เปิด ticket ที่ผู้ซื้อ verified มีสิทธิ์และเห็น paid/issued แยกจาก delivery ที่ยังไม่ทำ; guest ไม่มีขั้นสมัครสมาชิกตลอดเส้นทางซื้อ
- [ ] Verification — PostgreSQL/provider integration: verified success/forged/mismatch/duplicate/out-of-order และ crash-retry มี ticket count/QR/ยอดทางบัญชีถูกครั้งเดียว
- [ ] Verification — E2E local guest: catalog→OTP→reserve→QR→verified success→เห็นบัตรครบโดยไม่สมัคร; ตรวจ quota sibling session คงเดิม
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
