# TASK-003: บัญชีหลังบ้านตั้งรหัสผ่านใหม่ทางอีเมลได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner/organizer/scanner ขอ reset และใช้ลิงก์ที่ยัง valid ได้ โดยควบคุมอายุ การใช้ซ้ำ และการเปิดเผยบัญชี พร้อม Resend transport สำหรับงานอีเมล local

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-002 — [เจ้าของเว็บเริ่มบัญชีภายในและล็อกอินตามบทบาทได้](TASK-002-owner-login.md)

## Todo

- [x] ส่งมอบและตรวจ AC-55, AC-56 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-54: ทำ reset ของทั้งสาม role ให้ครบต่อจาก login ใน TASK-002; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-002 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] เชื่อม Resend ตาม ADR-0003 พร้อม local capture/test transport ที่ตรวจเนื้อหา/ลิงก์ได้; ไม่ส่งอีเมล production หรืออ้างว่า domain verified แล้ว
- [x] ทำ reset link แบบสุ่ม/ปลอดภัย one-use อายุ 30 นาที; reissue ยกเลิกลิงก์เก่า และไม่ล็อกบัญชีเพียงเพราะขอ reset
- [x] ใช้ข้อจำกัดส่งห่าง 60 วินาที สูงสุด 3 ครั้ง/15 นาทีต่อบัญชีและ generic response ตาม ADR-0004; counter ต้องอยู่ใน shared store
- [x] Verification — Unit/integration ควบคุมเวลา: valid/expired/replayed/reissued links, resend thresholds และ counter persistence ข้าม request (42 unit tests, 17 integration tests ผ่าน)
- [x] Verification — E2E: ทั้งสาม role reset ผ่าน test inbox แล้ว login ได้ด้วย credential ใหม่; existing/nonexisting account ให้ response ไม่เปิดเผยบัญชี (20/20 e2e tests ผ่านบน desktop and mobile chromium)
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง (`npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run build` ผ่าน 100%)
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน (Approved)
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
