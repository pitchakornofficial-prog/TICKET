# TASK-021: ลูกค้ายื่นคืนบางใบที่เข้าเงื่อนไขได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

ผู้ซื้อที่ verified เลือก ticket ที่คืนได้ ยื่นคำขอราคา face value และติดตามสถานะรอตรวจโดยไม่ revoke QR เอง

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-018 — [ผู้ซื้อค้นหาและเปิดบัตรของตนหลัง OTP ได้](TASK-018-guest-order-lookup.md)
- TASK-020 — [ทีมสแกนบันทึกเข้า ออก และกลับเข้าแบบออนไลน์ได้](TASK-020-online-admission.md)

## Todo

- [x] ส่งมอบและตรวจ AC-32, AC-33, AC-34 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-21: ส่วนเริ่มคำขอคืนจาก order ตน ร่วม TASK-018; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-018 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ทำ buyer request UI/eligibility สำหรับ partial/whole ticket ตาม normal cutoff 168 ชั่วโมงรวมจุดเท่ากับ และตรวจ admission history ไม่ให้คืนใบที่เคยเข้าแล้ว
- [x] บันทึกเวลายื่นที่ใช้ตัดสิน cutoff และ ticket/quote face value ที่ขอคืน ไม่รวม customer fee; คำขอของคนอื่นถูกปฏิเสธ
- [x] สถานะ pending ไม่เท่ากับ owner approved ไม่ revoke ticket จากการยื่น; ป้องกันคำขอซ้ำ/ซ้อนที่ทำให้เกิดยอดคืนซ้ำ โดย approval ใช้ TASK-022
- [x] ให้ special-window eligibility ที่ TASK-025 เพิ่มต่อได้โดยไม่เปลี่ยน cutoff ปกติหรือ reset เวลายื่น
- [x] Verification — Unit/integration clock: 168h+epsilon/168h/168h-epsilon, entered/exited ticket, quote face value และ duplicate request
- [x] Verification — E2E: verified buyer เลือกบางใบ ยื่นรอตรวจ เห็นยอดราคาอย่างเดียว; pending ticket ยังใช้ online scan ได้และยังไม่ลดสิทธิ์ใบอื่น
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

- `npm run lint`: Biome checked 186 files, 0 warnings, 0 errors.
- `npm run typecheck`: Next route typegen + tsc passed with 0 errors.
- `npm run test:unit`: Vitest passed 20 files, 117 tests (including `tests/unit/refund-requests.test.ts` 4 tests).
- `npm run test:integration`: Vitest integration passed 21 files, 70 tests on PostgreSQL (including `tests/integration/refund-requests.test.ts` 4 tests).
- `npx playwright test tests/e2e/refund-requests.spec.ts`: Playwright passed 2 tests (desktop-chromium 26.8s, mobile-chromium 20.9s).
- `npm run build`: Standalone production build succeeded (37 routes generated).

## Review Evidence

- Code Review conducted in final mode on 2026-10-21.
- Contract Compliance:
  - **AC-32 (Cutoff & Admission checks)**: Verified normal cutoff boundary inclusive at 168 hours before session start (`now <= sessionStartTime - 168h`), rejecting with `PAST_REFUND_CUTOFF` when past cutoff. Verified rejection of previously admitted tickets (`TICKET_ALREADY_ADMITTED`) using admission entry history.
  - **AC-33 (Face-value calculation)**: Verified refund calculation strictly sums ticket face values from `ticket_types`, omitting customer service fees and processing fees.
  - **AC-34 (Partial/Whole & Pending state)**: Verified buyer can refund partial or whole tickets. Status remains `pending` and does not revoke ticket status or QR payload (ticket remains `valid`). Verified duplicate refund request prevention (`DUPLICATE_REFUND_REQUEST`) on already pending or approved tickets.
  - **AC-21 & AC-22 (Authentication & Tampering protection)**: Verified buyer access is gated by OTP session token (`getVerifiedGuestSession`) and rejects cross-buyer tampering (`FORBIDDEN`).
  - **Design & UI guidelines**: Verified Thai language, Kanit font, zero emojis (pure SVGs only), 60/30/10 palette, and mobile responsiveness.
- All verification gates passed (lint 0 errors, typecheck 0 errors, unit 117 tests passed, integration 70 tests passed, e2e 2 tests passed). Status updated to `done`.
