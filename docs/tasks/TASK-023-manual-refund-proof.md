# TASK-023: เจ้าของเว็บบันทึกการโอนคืนและหลักฐานส่วนตัวได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner บันทึก manual refund จริงหรือสถานะรอโอน/ล้มเหลวได้ โดย QR/liability ไม่ย้อนผิดและหลักฐานดูได้เฉพาะ owner

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- TASK-022 — [เจ้าของเว็บอนุมัติคืนแล้วเพิกถอน QR และคืนโควตาได้ครั้งเดียว](TASK-022-refund-approval.md)

## Todo

- [x] ส่งมอบและตรวจ AC-37 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-92: สิทธิ์ไฟล์หลักฐาน refund; TASK-029 เติม payout proof; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-029 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ส่วนร่วม AC-93: manual refund failure/retry/liability; TASK-029 เติม payout failure; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-029 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ทำ owner manual-transfer recording ของ normal/exception refunds: มี completed เมื่อบันทึกการโอนจริง ไม่เรียก bank transfer หรือ Omise refund API
- [x] เก็บ proof ที่ R2/private boundary ต่อจาก media adapter ใน TASK-005 ด้วย local storage substitute; owner เท่านั้นเปิดไฟล์ได้ buyer/organizer เห็นเพียงยอด/สถานะ scanner ไม่มีสิทธิ์
- [x] โอนล้มเหลว/ยังไม่โอนให้คง approved/refund-pending liability และ revoked QR; retry/แก้หลักฐาน/กดซ้ำไม่เพิ่ม transfer/หักเงิน/คืน quota ซ้ำ
- [x] แยกประวัติการแก้หลักฐานออกจากยอดโอนจริง ไม่ใช้การมีไฟล์แทนข้อเท็จจริงว่าเงินโอนสำเร็จ
- [x] Verification — Integration authorization direct file access/response และ duplicate/failure transfer recording; ไม่มี external bank-transfer/refund call
- [x] Verification — E2E: owner บันทึกโอน/หลักฐานและเปิดได้ ผู้รับเงินดูยอด/สถานะได้แต่เปิดไฟล์ตรงไม่ได้; failure คงรอโอนและ QR ไม่กลับ valid
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] Review approved — focused implementation and tests against SPEC-001; AC-37, AC-92 (ร่วม), AC-93 (ร่วม) verified; unit (124 passed), integration (3 passed), e2e (2 passed across desktop/mobile chromium), lint (0 errors), typecheck (0 errors) passed; no findings.
- [x] ตรวจสอบ Git repository: คง focused changes สำหรับ commit ตาม workflow นโยบายของโปรเจกต์

## Verification Evidence

1. **Lint:**
   - Command: `npm run lint`
   - Result: 0 warnings, 0 errors across 199 files.

2. **Typecheck:**
   - Command: `npm run typecheck`
   - Result: 0 errors across all TypeScript files and Next.js route type generation.

3. **Unit Tests:**
   - Command: `npm run test:unit`
   - Result: 124 passed (22 test files, including 4 tests in `tests/unit/manual-refund-proof.test.ts`).

4. **Integration Tests:**
   - Command: `npm run test:integration -- tests/integration/manual-refund-proof.test.ts`
   - Result: 3 passed (tested with real PostgreSQL container `ticket_test` on port 55433).
   - Scenarios tested:
     - Manual refund transfer recording, settling liability to `'settled'`, and idempotency (AC-37, AC-107, G-36).
     - Transfer failure recording keeping liability `'unpaid'`, revoked tickets remaining revoked, admission scan rejected, and retry transfer settling liability (AC-93).
     - Enforcing private storage boundary: only owner can retrieve proof files, 403 Forbidden for organizer/scanner/buyer, and buyer public order summary stripping transfer proof keys (AC-92).

5. **End-to-End Tests:**
   - Command: `$env:PLAYWRIGHT_BROWSERS_PATH=".cache/ms-playwright"; npx playwright test tests/e2e/manual-refund-proof.spec.ts`
   - Result: 2 passed across `desktop-chromium` (36.9s) and `mobile-chromium` (27.3s).
   - Journey verified:
     - Guest buyer buys tickets -> requests refund in `/my-tickets` -> owner approves refund -> owner records transfer failure (AC-93) -> owner records successful transfer with note (AC-37) -> owner sees completed status in dashboard -> guest checks `/my-tickets` and sees completed status with transferred amount without proof download link (AC-92) -> unauthenticated direct access to proof URL returns 403 Forbidden (AC-92).

6. **Production Build:**
   - Command: `npm run build`
   - Result: Next.js standalone build compiled successfully (36 static/dynamic routes).
