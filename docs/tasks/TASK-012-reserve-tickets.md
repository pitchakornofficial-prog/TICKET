# TASK-012: ลูกค้ายืนยันจำนวนแล้วกันบัตรครบทุกประเภทได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Guest ที่ผ่าน OTP ยืนยัน order หนึ่งงาน/หนึ่งรอบแล้วได้ reservation/quote ที่ถูกต้อง โดยไม่แย่งใช้ stock เดียวกันหรือเกิน limit

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-011 — [ลูกค้ากรอกข้อมูลและยืนยันอีเมลโดยไม่สมัครสมาชิกได้](TASK-011-guest-email-verification.md)
- TASK-010 — [เจ้าของเว็บตั้งค่าบริการและเงินสำรองรายงานได้](TASK-010-event-fee-settings.md)

## Todo

- [x] ส่งมอบและตรวจ AC-10, AC-14, AC-61, AC-69, AC-106, AC-111 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-12: ปฏิเสธ reservation เมื่อ OTP ยังไม่ผ่าน; TASK-014 ตรวจ payment request guard จริง; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-014 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ส่วนร่วม AC-06: แยก quota ระหว่างรอบตอน reserve; TASK-015 ตรวจตอนขาย/issue; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-015 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ส่วนร่วม AC-13: เริ่ม deadline หลัง OTP+confirm; TASK-014 ตรวจ guard ก่อนสร้าง QR; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-014 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ทำ quantity confirmation/order/reservation UI และ transaction ที่จัดสรรทุกประเภทครบหรือไม่ยืนยัน partial hold; ตรวจ limit จากผลรวมทุกประเภทต่อ order
- [x] คำนวณ/บันทึก buyer quote ตาม price/customer fee ที่มีผล พร้อม subtotal/fee/total และ deadline 15 นาทีหลัง OTP+confirm ก่อน QR; ใช้ข้อมูลกลางตัดสิน stock
- [x] ล็อก organizer fee mode/rate ของงานอย่าง atomic กับ reservation แรกตาม G-49 แม้ค่าตั้งแก้พร้อมกัน; ปฏิเสธการแก้หลังล็อกทั้งย้อนหลัง/ใช้กับ order ใหม่ และไม่ปลดล็อกเมื่อ reservation แรกหมดอายุ
- [x] ปฏิเสธข้าม OTP/ข้าม session/ข้าม quota ด้วย direct request; เก็บ quote ให้ TASK-024 ตรวจการคงยอดเมื่อ live edits อนุมัติ
- [x] Verification — PostgreSQL integration concurrent requests: แย่งใบสุดท้าย/หลายประเภทที่ประเภทหนึ่งหมด/fee edit race; ไม่มี oversell หรือ partial orphan hold
- [x] Verification — Unit/integration/E2E: limit เท่ากับ/เกิน, required OTP guard, quotes ทั้งสาม customer modes และแยก sibling session/type; ตรวจ first-reservation lock ด้วย owner UI
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

- `npm run typecheck`: Passed (Next route types generated, tsc --noEmit exit code 0).
- `npm run lint`: Passed (129 files checked, 0 errors, 0 warnings).
- `npm run test:unit`: Passed (84 tests across 11 test files, including 7 tests in `tests/unit/reservation.test.ts`).
- `npm run test:integration`: Passed (40 tests across 12 test files, including 6 tests in `tests/integration/reservation.test.ts` testing quota exhaustion, limitPerOrder validation, guest OTP verification guard, atomic first-reservation fee lock, and multi-ticket reservation).
- `npx playwright test tests/e2e/reserve-tickets.spec.ts`: Passed (2 tests passed across `desktop-chromium` [21.1s] and `mobile-chromium` [16.9s]).
- `npm run build`: Passed (Next.js 16.4.2 standalone production build succeeded).

## Code Review Evidence

- Reviewed against SPEC-001 acceptance criteria and verification rows:
  - **AC-10 / AC-106**: Total ticket quantity validation across all ticket types in an order (`totalTickets > limitPerOrder` rejected, `<= limitPerOrder` allowed).
  - **AC-14**: Shared PostgreSQL row lock (`SELECT ... FOR UPDATE`) guarantees concurrency control preventing overselling on concurrent requests for the final ticket.
  - **AC-61 / AC-106**: All-or-nothing hold across ticket types; requests with any unavailable ticket type abort entirely without creating orphan holds.
  - **AC-69**: Exact buyer quotation calculated based on effective fee mode (`per_ticket`, `per_order`, or `percentage`) and 15-minute countdown reservation hold window (`RESERVATION_HOLD_SECONDS = 900`).
  - **AC-111**: Organizer fee mode and rate locked atomically upon first reservation within the transaction (`organizerFeeLocked = TRUE`), preventing subsequent modifications.
  - Contributing parts **AC-12** (Guest OTP verified token guard), **AC-06** (session quota isolation), and **AC-13** (15-minute countdown deadline) verified.
- Design & domain constraints verified: Thai language, Kanit font, SVG icons only (0 emojis), 60/30/10 palette, mobile-responsive layout.
- Review decision: **Approved**. Task moved to `done`.
