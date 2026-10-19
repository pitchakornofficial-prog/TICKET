# TASK-034: ผลออฟไลน์ซิงก์กลับครั้งเดียวและแจ้งข้อมูลขัดแย้งได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

เครื่องหลักส่งผลค้างกลับส่วนกลางและแสดง pending ตาม acknowledgement จริง โดยคง audit/owner review หากขัดกับ central revocation

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-033 — [เครื่องหลักสแกนเข้า ออก และกลับเข้าโดยออฟไลน์ได้](TASK-033-offline-admission.md)
- TASK-022 — [เจ้าของเว็บอนุมัติคืนแล้วเพิกถอน QR และคืนโควตาได้ครั้งเดียว](TASK-022-refund-approval.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-99, AC-102 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-42: pending/last-sync หลัง reconnect ตามผลรับจริง ร่วม TASK-033; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-033 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ทำส่งผลตามลำดับ/รับ acknowledgement และโหลดข้อมูลล่าสุดโดยไม่เพิ่มผลเดิมเมื่อ reconnect/retry/partial sync
- [ ] ถ้า cache valid แต่กลาง revoked หรือประวัติขัดแย้ง ให้คง offline audit และแจ้ง owner ตรวจ ไม่ revalidate QR กลาง ลบประวัติ หรือย้อน refund/payout อัตโนมัติ
- [ ] pending ลดตามผลที่ส่วนกลางรับจริง last successful sync เปลี่ยนเมื่อจบจริง; หาก sync ไม่ครบยังแสดงค้างเพื่อ handover task ใช้เป็น gate
- [ ] Verification — Integration: send duplicated/out-of-order batches, partial ack/retry และ cached-valid→central refund revoke→offline admission→sync conflict; ตรวจ central validity/refund ไม่ย้อน
- [ ] Verification — E2E reconnect: pending/historyไม่ซ้ำ ownerเห็น conflict และ last sync ไม่อ้างสำเร็จก่อนครบ
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
