# TASK-032: ผู้จัดงานกำหนดเครื่องหลักและเตรียมข้อมูลออฟไลน์เฉพาะงานได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer กำหนด primary เครื่องเดียวทั้งงานขณะออนไลน์ และ scanner รับ dataset ล่าสุดที่ไม่รั่ว buyer PII เพื่อเตรียมใช้ offline

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-020 — [ทีมสแกนบันทึกเข้า ออก และกลับเข้าแบบออนไลน์ได้](TASK-020-online-admission.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-94 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-65: offline dataset มีเฉพาะข้อมูล scanner scope ร่วม TASK-020 ที่ตรวจ online response; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-020 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ทำ primary assignment ขณะออนไลน์โดย organizer ของงานตนเท่านั้น และแสดง identity/ขอบเขตเครื่องหลักที่เตรียมพร้อม
- [ ] รับ dataset ticket/type/session/entry-exit/revocation/window ที่มีสิทธิ์ พร้อม last successful sync; ไม่มี buyer name/email/phone หรือ proof
- [ ] ตรวจ primary uniqueness แบบ atomic ทั้งงาน ไม่ใช้หนึ่ง primary ต่อ session จนกลายเป็นหลายเครื่องในงานเดียว; ไม่ทำ handover ข้ามเงื่อนไขซึ่งเป็น TASK-035
- [ ] เตรียม local storage/cache readiness ตาม NQ-06 โดยบันทึกข้อจำกัดจริง และไม่แสดงว่า sync ล่าสุดสำเร็จถ้ายังรับข้อมูลไม่ครบ
- [ ] Verification — Integration authorization/concurrent primary assignment: organizer A ไม่กำหนดของ B และได้ primary หนึ่งเครื่องต่อทั้งงาน
- [ ] Verification — E2E/device: login scanner→รับข้อมูล→แสดง primary/last sync; inspect online response และ local dataset ว่าไม่มี buyer PII/proof
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
