# TASK-030: เจ้าของเว็บปล่อยเงินสำรองหลังรอบสุดท้ายสิ้นสุดได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner ตรวจและปล่อย reserve ที่กันได้จริงหลังรอบสุดท้ายของงานจบ โดยไม่ปล่อยตาม timer หรือสร้างยอดเกินเงินคงเหลือ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#settlement-and-reserve-invariants), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-028 — [ผู้จัดงานอ่านยอดขาย ค่าบริการ และยอดพร้อมจ่ายของงานตนได้](TASK-028-organizer-money-report.md)

## Todo

- [x] ส่งมอบและตรวจ AC-83 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ทำ owner reserve review/release ที่ใช้วันสิ้นสุดรอบสุดท้ายทั้งงานและข้อมูล E/P/X/U/H จาก report ไม่ใช่แค่รอบแรกจบ
- [x] เพิ่ม U เฉพาะยอดที่ owner สั่งปล่อยได้จริง ไม่เกิน actual held และไม่เพิ่มซ้ำเมื่อ retry; reserve target เปลี่ยนตาม approved refunds โดยไม่สร้าง held ติดลบ
- [x] แสดง held/payable หลังปล่อยโดยไม่สั่ง bank payout อัตโนมัติ; การโอนเงินไปผู้จัดงานยังเป็น TASK-029
- [x] Verification — Unit/integration clock/authorization: ก่อนรอบสุดท้ายจบ/หลังจบ/owner ยังไม่สั่ง/role อื่น/duplicate action
- [x] Verification — E2E report: E900/P810/H90 ก่อนปล่อยพร้อมจ่าย0 หลัง final session และ owner ปล่อย90 H0 พร้อมจ่าย90; ไม่มีเงินคงเหลือไม่สร้างยอดปล่อยใหม่
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

1. **Unit tests (`npm run test:unit`)**:
   - `tests/unit/reserve-release.test.ts` (4 tests passed)
   - Total suite: 156 passed across 29 test files.
   - Tests:
     - `disallows reserve release before final session ends (AC-83)`
     - `allows reserve release when final session has ended`
     - `rejects release amount exceeding actual held reserve`
     - `idempotent repeated release within duplicate window`

2. **Integration tests (`npm run test:integration`)**:
   - `tests/integration/reserve-release.test.ts` (5 tests passed)
   - Total suite: 105 passed across 30 test files against real local PostgreSQL.
   - Tests:
     - `calculates final session end and prevents early release before final session ends (AC-83)`
     - `allows owner to release reserve after final session ends, accurately increasing payable amount`
     - `rejects release when requested amount exceeds held reserve or held reserve is 0`
     - `enforces role authorization: organizer and scanner are forbidden from releasing reserve`
     - `handles duplicate release requests idempotently without inflating released reserve`

3. **E2E tests (`npm run test:e2e` / Playwright)**:
   - `tests/e2e/reserve-release.spec.ts` (2 tests passed across desktop-chromium and mobile-chromium)
   - Verifies full journey:
     - Organizer creates concert with 2 sessions.
     - Owner approves sessions & configures 10% fee + 10% reserve.
     - Buyer purchases ticket ($E = 900$, $T_{\text{res}} = 90$, $H = 90$, $A_{\text{pay}} = 810$, $P = 0$).
     - Owner records weekly payout ($P = 810$, $A_{\text{pay}} = 0$, $H = 90$).
     - Owner visits Reserve Release Manager, sees "จบรอบสุดท้ายแล้ว" badge.
     - Owner releases 90 THB reserve: $U$ becomes 90.00, $H$ becomes 0.00, $A_{\text{pay}}$ becomes 90.00.
     - Submit button becomes disabled as $H = 0$.
     - Role isolation: Organizer (403), Scanner (403), Unauthenticated (401).

4. **Code Quality Checks**:
   - `npm run lint`: Biome checked 238 files, 0 errors, 0 warnings.
   - `npm run typecheck`: Next route typegen + TypeScript passed with 0 errors.
   - `npm run build`: Turbopack standalone production build succeeded (38 routes).

## Review Evidence & Approval

- **Review Mode**: Final
- **Review Result**: Approved (Status transition: `in_review` -> `done`)
- **Findings**: None (P0: 0, P1: 0, P2: 0, P3: 0)
- **Spec & Invariant Compliance**:
  - **AC-83 / G-31**: Final session end check correctly validates against maximum session end time of non-cancelled event sessions; releases before final session end are rejected (`CANNOT_RELEASE_BEFORE_FINAL_SESSION_END`). No timer-based automatic release occurs.
  - **G-30 / Accounting Invariants**: Reserve calculation strictly adheres to $E = \text{netSales} - \text{organizerFee}$, $\text{Reserve Target} = R(\max(E, 0) \times s / 100)$, $\text{Reserve Outstanding} = \max(0, \text{Target} - U)$, $H = \min(\text{Outstanding}, \max(L, 0))$, $A_{\text{pay}} = \max(0, L - H)$. Released reserve increments $U$, decreasing $H$ and increasing $A_{\text{pay}}$ without exceeding actual held reserve or creating negative values.
  - **Role Boundaries & Security**: Strict role enforcement ensures only Owner can release reserve (HTTP 401 for unauthenticated, HTTP 403 for organizer and scanner).
  - **Idempotency & Replay Protection**: 15-second duplicate window check prevents double releases on rapid repeated submissions.
  - **Design Guidelines**: Thai language throughout, Kanit typography, pure SVGs (no emojis), 60/30/10 palette with semantic status indicators, mobile-friendly responsive layout.
  - **Storage Integrity**: Durable PostgreSQL table `event_reserve_releases` with foreign keys and indexes; zero ephemeral in-memory state.
