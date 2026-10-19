# TASK-020: ทีมสแกนบันทึกเข้า ออก และกลับเข้าแบบออนไลน์ได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Scanner ตรวจ ticket กลางตามงาน/รอบ/ช่วงรับเข้าแล้วบันทึก entry/exit อย่างถูกต้อง รวมป้องกัน concurrent entry ซ้ำ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-009 — [ผู้จัดงานเพิ่มทีมสแกนเฉพาะงานได้](TASK-009-scanner-accounts.md)
- TASK-015 — [ชำระสำเร็จที่ตรวจแล้วออก QR แยกใบได้](TASK-015-paid-ticket-issuance.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-08, AC-39, AC-49, AC-95, AC-100, AC-101 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-65: online ticket/scan response ไม่มี buyer PII; TASK-032 ตรวจ offline dataset; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-032 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ให้ organizer กำหนด admission window แยกรอบและ scanner เลือกเฉพาะ scope ตน; camera/UI ตาม D-05/D-10/D-11 โดยไม่เพิ่ม manual admission override
- [ ] ทำ online state transition out→in→out→in โดยต้องมี exit ก่อน reentry; repeat in/invalid exit ไม่สร้างประวัติขัดแย้ง
- [ ] ตรวจ paid/valid/not revoked/event/session/window ที่ central state; round ยกเลิก ผิดรอบ หรือ scope ไม่มีสิทธิ์ไม่ผ่าน
- [ ] เฉพาะเลขบัตร/type/session/entry-exit และข้อมูลที่จำเป็น ไม่มี buyer name/email/phone ทั้ง UI/response; admission history ใช้ตรวจ refund ภายหลังได้
- [ ] Verification — Unit/integration: wrong event/session/window/revoked และ entry/exit/reentry matrix; PostgreSQL concurrent two scans ให้ successful entry เพียงหนึ่ง
- [ ] Verification — E2E/camera walkthrough local: valid ticket ผ่านพร้อม history, repeat ไม่ผ่าน, exit→reentry ผ่าน; ผลมี text+icon ไม่พึ่งสี
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
