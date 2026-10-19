# TASK-022: เจ้าของเว็บอนุมัติคืนแล้วเพิกถอน QR และคืนโควตาได้ครั้งเดียว

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner อนุมัติคำขอที่ยังเข้าเกณฑ์และทำให้เฉพาะ ticket ที่คืนถูก revoke พร้อมบันทึก liability/คืน quota ณ approval

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-021 — [ลูกค้ายื่นคืนบางใบที่เข้าเงื่อนไขได้](TASK-021-refund-requests.md)
- TASK-016 — [เงินยืนยันล่าช้าถูกจัดสรรบัตรหรือเปิดเคสคืนเต็มยอดได้](TASK-016-late-payment-recovery.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-36, AC-88, AC-89, AC-90, AC-107 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ใช้ owner approval boundary กับ buyer requests และ exception cases ที่มีจาก TASK-016; ตรวจ admission ล่าสุดซ้ำก่อนอนุมัติ ไม่ให้ใบเคยเข้าแล้วได้รับ refund แม้ออกแล้ว
- [ ] ทำ approval/revoke/refund liability/quota return แบบ transaction และ idempotent: คง pending validity ก่อนอนุมัติ คืน quota เฉพาะรอบที่ยังขาย ไม่เปิดขายรอบยกเลิก
- [ ] เก็บ approved refund amount แยกจาก transfer completion เพื่อ TASK-028/TASK-029 คำนวณ E/กันยอดทันทีตาม G-36; ไม่หักยอดซ้ำเมื่อโอนสำเร็จ
- [ ] ป้องกัน duplicate/overlapping request และ scan/approval race ไม่ให้ใบเดียวกันได้รับสิทธิ์ refund/entry ที่ขัดกติกา; การโอนเงินจริงอยู่ TASK-023
- [ ] Verification — PostgreSQL integration: concurrent scan/approval, duplicate approval/requests และ release ซ้ำ ตรวจ QR/liability/quota เกิดครั้งเดียว
- [ ] Verification — E2E: partial approval revoke เฉพาะใบก่อนโอน ส่วนใบอื่นและ pending request ยังทำงานตามกติกา; สแกนก่อน/หลัง approval ได้ผลตรง central state
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
