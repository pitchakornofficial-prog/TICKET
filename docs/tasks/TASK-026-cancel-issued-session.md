# TASK-026: ยกเลิกรอบแล้วสร้างรายการรอคืนสำหรับบัตรที่เข้าเกณฑ์ได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

คำขอยกเลิกมีผลหลัง owner อนุมัติ หยุด checkout รอบนั้น และสร้าง refund cases ของ issued tickets ที่เข้าเกณฑ์โดยไม่รอผู้ซื้อยื่น

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-022 — [เจ้าของเว็บอนุมัติคืนแล้วเพิกถอน QR และคืนโควตาได้ครั้งเดียว](TASK-022-refund-approval.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-35, AC-91 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-108: ส่วน request/approval ของ cancellation ร่วม TASK-025; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-025 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ทำ cancel request/approval แยกจาก draft/pending edit; organizer ขอได้ owner อนุมัติจึงมีผลและปฏิเสธ checkout ใหม่
- [ ] สร้างรายการรอคืนเฉพาะ ticket ที่เข้าเกณฑ์ตาม G-22/G-38 โดยเชื่อม case เดิม ไม่สร้างซ้ำกับ partial requests/approved refunds
- [ ] ยอด cancelled issued-ticket refund เป็น face value ไม่รวม customer fee ตาม R5 และยังต้อง owner review/manual transfer เดิม ไม่แสดงว่าโอนสำเร็จเพียงเพราะ cancel
- [ ] คง organizer flat fee ของทั้งงานตาม G-29 ไม่ waive จาก cancellation; financial report แสดงผลครบใน TASK-028 ส่วน reservation/payment ค้างปิดใน TASK-027
- [ ] Verification — Integration authorization/idempotency: pending cancel ไม่เปลี่ยนสถานะจริง approved cancel ปิดซื้อและสร้าง case ครบครั้งเดียว; used tickets และ existing cases ไม่ถูกคืนซ้ำ
- [ ] Verification — E2E: owner อนุมัติ cancel ของรอบที่มี issued tickets แล้วเห็นรายการรอคืน face-only โดย buyer ไม่ต้องยื่นเอง
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
