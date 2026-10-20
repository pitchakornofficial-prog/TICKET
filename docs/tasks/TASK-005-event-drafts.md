# TASK-005: ผู้จัดงานบันทึกงาน รอบ และประเภทบัตรของตนได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Organizer จัดเตรียมงานหลายรอบ/ประเภทบัตรพร้อมข้อมูลแสดงคอนเสิร์ตได้ และจัดการเฉพาะงานตนก่อนส่งให้ owner อนุมัติ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- TASK-004 — [เจ้าของเว็บเชิญผู้จัดงานเข้าระบบได้](TASK-004-organizer-invitations.md)

## Todo

- [x] ส่งมอบ prerequisite/ส่วนสมทบของ AC-07 ตามขอบเขตด้านล่าง ไม่อ้างว่า criteria ของงานที่ร่วมกันครบจาก task นี้เพียงงานเดียว
- [x] ส่วนร่วม AC-07: ส่วนการอ่าน/แก้ข้อมูลงานข้าม organizer; TASK-028 เติมการปฏิเสธอ่านรายงานของผู้อื่น; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-028 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ทำ draft management ผ่าน UI และ persistence สำหรับ event/session/ticket type/ราคา/quota/limit ต่อ order/ข้อมูลวันสถานที่และโปสเตอร์ตาม scope สเปก; ไม่เพิ่มเลขที่นั่งหรือชื่อผู้เข้าแยกใบ
- [x] จำกัด read/write งานตาม organizer owner; โครงสร้าง session/type ต้องรองรับ quota และเวลาที่แยกกันโดยไม่สมมติ schema จากเอกสารนี้
- [x] เชื่อม public poster/media ผ่าน R2 ตาม ADR-0003 ด้วย local substitute สำหรับ verification; ไม่ใช้ disk เฉพาะ web instance เป็น shared production storage และไม่เปิด proof files เป็น public
- [x] ให้ส่งต่อข้อมูล draft ที่ครบไปเส้นทางอนุมัติของ TASK-006 โดยไม่เปิดขาย draft เอง
- [x] Verification — Integration: roundtrip งานหลายรอบ/หลาย type และลอง direct read/write ด้วย organizer อีกคนแล้วไม่ได้ข้อมูล/สิทธิ์ (tests/integration/events.test.ts ผ่าน)
- [x] Verification — E2E: organizer บันทึกและเปิด draft ตนเองพร้อมโปสเตอร์ผ่าน local storage double ได้; ยังไม่อ้างว่างานเปิดขายก่อนมี approval (tests/e2e/organizer-events.spec.ts ผ่าน)
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง (44 unit, 23 integration, 24 e2e tests ผ่าน 100%)
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน (Approved)
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
