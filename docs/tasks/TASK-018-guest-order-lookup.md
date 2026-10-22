# TASK-018: ผู้ซื้อค้นหาและเปิดบัตรของตนหลัง OTP ได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Guest ค้นหาด้วย email+phone ที่ตรงกันแล้ว OTP เพื่อเปิด order/ticket ตน รวมถึงกลับจากลิงก์อีเมลและกรณีส่งบัตรไม่สำเร็จ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-017 — [ผู้ซื้อได้รับอีเมลบัตรและติดตามการส่งที่ล้มเหลวได้](TASK-017-ticket-email-delivery.md)

## Todo

- [x] ส่งมอบและตรวจ AC-22, AC-62, AC-63 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-21: ส่วนเปิด order/ticket ของตน; TASK-021 เติมเริ่มคำขอ refund; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-021 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ส่วนร่วม AC-75: ส่วน lookup recovery หลัง delivery failure ร่วม TASK-017; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-017 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ทำ purchased-ticket lookup โดยต้อง email/phone ตรง order ทั้งสองค่าและผ่าน OTP ก่อนรายละเอียด; ไม่ใช้ข้อมูลนี้เป็น public catalog search
- [x] order link ไม่ข้าม OTP ถ้า session ยังไม่ยืนยัน และ direct order ID/เปลี่ยน email/session ไม่ให้เข้าของคนอื่น
- [x] ใช้ session TTL/details ที่บันทึกจาก NQ-06 โดยไม่เพิ่ม customer signup; order view แสดง paid/issued/refund/delivery ตามจริงและ QR เดิม
- [x] เชื่อมจุดเริ่ม refund ไปขอบเขต TASK-021 โดย task นี้ไม่อ้างว่ามี eligibility/approval ที่ยังไม่ทำ
- [x] Verification — Authorization integration: matching/mismatching pair, expired/unverified session, link possession, cross-email/order tampering
- [x] Verification — E2E: lookup→OTP→order/QR และ order link→OTP; จำลอง delivery failure จาก TASK-017 แต่ OTP ส่งได้ แล้วเห็น ticket เดิมโดยไม่สร้างใหม่
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

- `npm run typecheck`: Next route type generation + TypeScript ผ่าน 0 errors
- `npm run lint`: Biome 2.5.15 ผ่าน 0 warnings, 0 errors บน 165 files
- `npm run test:unit`: Vitest 5.0.5 ผ่าน 17 test files, 105 tests (รวม `tests/unit/guest-order-lookup.test.ts` 5 tests)
- `npm run test:integration`: Vitest 5.0.5 บน `ticket_test` ผ่าน 18 test files, 60 tests (รวม `tests/integration/guest-order-lookup.test.ts` 5 tests)
  - AC-62: ตรวจคู่ email/phone ที่ตรงและไม่ตรง ปฏิเสธการส่ง OTP เมื่อไม่พบ order
  - AC-21, AC-62: ยืนยัน OTP และส่งคืนรายการ orders พร้อมบัตรที่ออกสำเร็จและ QR code เดิม
  - AC-22: ป้องกันการเจาะข้ามบัญชี ผู้ซื้อ A ถูกปฏิเสธ 403 Forbidden เมื่อพยายามเปิด order ของผู้ซื้อ B
  - AC-63: ป้องกันการเปิด order link โดยไม่มี session ยืนยัน OTP (401 Unauthorized)
  - AC-75: การกู้คืนบัตรหลัง email delivery failure สามารถค้นหาและเปิดดูบัตร/QR code เดิมได้ครบถ้วน
- `npm run build`: Next.js Standalone build สำเร็จ (รวม routes `/my-tickets`, `/orders/lookup`, `/api/public/orders`, `/api/public/orders/[id]`, `/api/public/orders/request-lookup-otp`, `/api/public/orders/verify-lookup-otp`)
- `npm run test:e2e`: Playwright 1.64.1 ผ่านทั้ง 2 projects (desktop-chromium และ mobile-chromium, `tests/e2e/guest-order-lookup.spec.ts`)
  - ตรวจสอบ lookup flow: กรอก email/phone -> รับ OTP -> ยืนยัน OTP -> แสดงบัตรและ QR แยกใบ
  - ตรวจสอบ direct order link gating: ลิงก์ตรงถูกบล็อกจนกว่าจะยืนยัน OTP สำเร็จ
  - ตรวจสอบ D-14 (zero emojis) และ responsive layout ผ่านสมบูรณ์

## Code Review Record

- Mode: final review
- Status: approved (moved from `in_review` to `done`)
- Verification re-executed and passed:
  - `npm run typecheck`: 0 errors
  - `npm run lint`: 0 warnings, 0 errors across 165 files
  - `npm run test:unit`: 17 files, 105 passed
  - `npm run test:integration`: 18 files, 60 passed
  - Playwright E2E: 2 passed across `desktop-chromium` and `mobile-chromium`
  - `npm run build`: standalone build succeeded
- Acceptance criteria coverage confirmed:
  - AC-21 (guest ticket lookup & QR viewing without signup)
  - AC-22 (cross-buyer tampering protection: 403 Forbidden)
  - AC-62 (exact email+phone matching before OTP, order isolation)
  - AC-63 (direct order link OTP gating: 401 Unauthorized for unverified sessions)
  - AC-75 (lookup recovery after email delivery failure preserves original tickets & QRs)
- Engineering and design standards confirmed:
  - Zero emojis (D-14), Kanit font, Thai language, 60/30/10 palette, mobile responsive layout
  - Clean separation of concerns with `src/server/guest-order-lookup.ts`, REST API routes, and client view components
