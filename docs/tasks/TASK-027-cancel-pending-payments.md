# TASK-027: ยกเลิกรอบระหว่างรอชำระแล้วคืนเงินตรงตามเวลาจริงได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

เมื่อ owner ยกเลิกรอบ ระบบยุติ reservation ค้างแต่ยังติดตามเงินจริง และเลือกยอดคืนจาก T/D/C ตาม G-50–G-52

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- TASK-026 — [ยกเลิกรอบแล้วสร้างรายการรอคืนสำหรับบัตรที่เข้าเกณฑ์ได้](TASK-026-cancel-issued-session.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-112, AC-113, AC-114 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-84: pending-cancel cases คง paid-but-not-issued/review และไม่เครดิต V_o; TASK-028 ตรวจ report/entitlement; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-028 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] cancel ณ C ให้ยุติ unconfirmed reservations/คืน quota ครั้งเดียวและหยุดแสดง QR ว่าชำระต่อได้ โดยไม่ลบ payment/quote/deadline เดิมหรือเปิดขายรอบยกเลิก
- [ ] ยังรับ/reconcile provider result ที่มาภายหลัง: T>D ใช้ G-35 คืนเต็ม; T<=D และ T<C ถือซื้อก่อนยกเลิกคืนราคาบัตรตาม R5; T<=D และ T>=C รวม T=C คืนเต็มยอดรวม customer fee
- [ ] ไม่ออก valid QR เข้ารอบยกเลิก ไม่สร้าง ticket เพียงเพื่อคืนเงิน และไม่สร้าง case ซ้ำ/เปลี่ยนยอดที่ประมวลผลไปแล้วจาก repeated callback
- [ ] แสดง owner/buyer review state พร้อม amount/reason โดยคง manual approval/transfer ของ TASK-022/TASK-023; ไม่อ้างว่าการหยุด UI ทำให้ provider รับเงินต่อไม่ได้
- [ ] Verification — Unit/provider/PostgreSQL integration: C=19:05 D=19:15, T=19:04/19:05/19:06/19:15/19:16 และ D<T<C; provider time เท่านั้นใช้ตัดสิน
- [ ] Verification — E2E: cancel pending→expiry/repeated cancel→late callback ทุก branch ตรวจ quota/order/QR/refund total คงที่; เส้นทางไม่ให้เงิน unissued ไป payout ตรวจร่วม TASK-028
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
