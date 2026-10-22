# TASK-013: reservation หมดเวลาแล้วคืนโควตาโดยไม่ต่ออายุได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

ลูกค้าเห็นเวลาคงเหลือจริงและระบบคืนโควตาครั้งเดียวเมื่อครบ 15 นาทีโดยยังไม่ยืนยันชำระ รวมการกลับมาซื้อใหม่หลังหมดอายุ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-012 — [ลูกค้ายืนยันจำนวนแล้วกันบัตรครบทุกประเภทได้](TASK-012-reserve-tickets.md)

## Todo

- [x] ส่งมอบและตรวจ AC-71 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-70: คง order/deadline เมื่อ refresh; TASK-014 ตรวจ repeated payment/QR creation ไม่ต่อเวลา; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-014 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ทำ expiry transition/release และ countdown จาก deadline ระบบ; ไม่ถือโควตาต่อเพียงเพราะ provider status ยังไม่ทราบหรือไม่ตอบ
- [x] refresh/กลับหน้าเดิมใช้ reference/deadline เดิม; การซื้อใหม่ตรวจ quote/stock/สิทธิ์ใหม่ ไม่คืนชีพ order เก่าและยังติดตาม payment เก่าได้
- [x] ออกแบบกลไกทำงานครบโดยไม่พึ่ง timer/memory ของ web process เดียว; ไม่เพิ่ม infrastructure ใหม่ที่ ADR ไม่ได้เลือก
- [x] Verification — Unit controlled clock และ PostgreSQL integration: ก่อน/ตรง/หลัง deadline, release ซ้ำ, restart และ concurrent expiry/reservation ไม่ทำให้ quota เกิน
- [x] Verification — E2E: countdown/refresh/expired state และเริ่ม order ใหม่; payment unknown fixture ไม่ทำให้ hold เกิน 15 นาที
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

- `npm run typecheck`: Passed (Next route types generated, tsc --noEmit exit code 0).
- `npm run lint`: Passed (132 files checked, 0 errors, 0 warnings).
- `npm run test:unit`: Passed (89 tests across 12 test files, including 5 tests in `tests/unit/reservation-expiry.test.ts`).
- `npm run test:integration`: Passed (44 tests across 13 test files, including 4 tests in `tests/integration/reservation-expiry.test.ts` testing automatic quota release upon 15-minute deadline, release idempotency, order and deadline persistence upon refresh, and anti-overselling under concurrent reservation at expiry).
- `npx playwright test tests/e2e/reservation-expiry.spec.ts`: Passed (2 tests passed across `desktop-chromium` [24.1s] and `mobile-chromium` [19.0s]).
- `npm run build`: Passed (Next.js 16.4.2 standalone production build succeeded).

## Code Review Evidence

- Reviewed against SPEC-001 acceptance criteria and verification rows:
  - **AC-71 / G-34**: Unconfirmed reservation at 15-minute deadline dynamically releases quota once without requiring manual intervention or in-memory timers. Verified via unit clock tests, PostgreSQL integration queries (`getTicketTypeAvailableQuota` and `expireOrders`), and Playwright E2E where the UI ceases showing tickets as reserved, indicates expiration, and restores released quota.
  - **AC-70 / G-14**: Active reservation maintains existing order ID, exact quotation, and original 15-minute deadline upon page refresh or repeated query. Verified via unit clock assertions, integration test (`getOrderReservation`), and E2E page reload test where the deadline is not restarted.
  - **Anti-Overselling Concurrency (AC-14, AC-71)**: Concurrent reservations competing for released quota at expiry are serialized via PostgreSQL transactions and row-locking (`SELECT ... FOR UPDATE`), strictly preventing overselling.
  - **Fresh Order Flow (G-34)**: Expired reservation cannot be revived or extended; customers can click "เริ่มทำรายการใหม่" to begin a fresh order checking current stock, quote, and OTP verification.
- Design & domain constraints verified: Thai language, Kanit font, SVG icons only (0 emojis), 60/30/10 palette, mobile-responsive layout.
- Review decision: **Approved**. Task moved to `done`.
