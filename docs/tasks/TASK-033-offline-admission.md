# TASK-033: เครื่องหลักสแกนเข้า ออก และกลับเข้าโดยออฟไลน์ได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

เครื่องหลักใช้ cached ticket ที่มีและบันทึกผลเข้า/ออกอย่างทนต่อ refresh พร้อมสถานะรอซิงก์ โดยไม่ยอมรับข้อมูลที่ยังไม่มี

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-032 — [ผู้จัดงานกำหนดเครื่องหลักและเตรียมข้อมูลออฟไลน์เฉพาะงานได้](TASK-032-offline-primary-dataset.md)

## Todo

- [x] ส่งมอบและตรวจ AC-40, AC-41, AC-50, AC-96, AC-103 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-42: แสดง connectivity/last sync/pending local results; TASK-034 เติม pending/last-sync หลัง reconnect; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-034 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] รองรับ offline entry/exit/reentry ด้วย state engine จาก TASK-020 และ dataset จาก TASK-032; ใช้เครื่องหลักเดียวทั้งงานพร้อมขั้นตอนหยุดเครื่องอื่นตาม O1
- [x] บัตรไม่มีใน dataset รวมบัตรเพิ่งซื้อให้รอออนไลน์ ไม่สรุปว่าผ่านหรือเป็นของปลอม; ไม่รับรู้ revocation ใหม่หลังตัดเน็ตโดยไม่มี sync
- [x] เขียนผลลง local storage ก่อนแสดง success, เก็บลำดับและ pending ให้คงหลัง refresh; storage write failure ต้องไม่อ้างว่าบันทึกสำเร็จ
- [x] แสดงผลสำเร็จ/ซ้ำ/ไม่ผ่าน/ต้องออนไลน์ด้วย text/icons/semantic colors และสถานะเชื่อมต่อ/last successful sync/pending ไม่พึ่งสีอย่างเดียว
- [x] Verification — Unit/integration offline state matrix และ storage failure: valid cached→entry/exit/reentry, repeat in/out, missing/new/revoked-at-snapshot ticket
- [x] Verification — E2E + device/camera walkthrough: ตัดเครือข่ายบน primary เครื่องเดียว สแกนสาม transitions แล้ว reload ยังมีผล/pending; เครื่องอื่นหยุดตามขั้นตอนและไม่อ้าง cross-device consistency
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

1. **Unit tests (`tests/unit/offline-admission.test.ts`):**
   - 5 tests passed:
     - Secondary scanner cannot perform offline scan (AC-40, O1).
     - Missing or newly bought ticket not in offline dataset informs user to wait for online connection (AC-41, O2).
     - Offline state transitions: entry -> repeat denial -> exit -> repeat denial -> reentry (AC-96, AC-50).
     - Local write failure must fail scan and NOT claim success (AC-103).
     - Offline validations: cancelled, refunded, wrong session, outside admission window (AC-100, AC-101).
   - Full unit test suite: 168 tests passed across 32 files (`npm run test:unit`).

2. **Integration tests (`tests/integration/offline-admission.test.ts`):**
   - 4 tests passed against real PostgreSQL:
     - Primary scanner fetches offline dataset from DB and performs full entry/exit/reentry sequence offline, with reload resilience (AC-96, AC-50, AC-103).
     - Missing or newly bought ticket not in offline snapshot returns wait for online (AC-41, O2).
     - Secondary scanner is rejected from offline scan (AC-40, O1).
     - Local write failure reports failure and rolls back state without claiming success (AC-103).
   - Full integration test suite: 116 tests passed across 33 files (`npm run test:integration`).

3. **E2E Playwright tests (`tests/e2e/offline-admission.spec.ts`):**
   - 2 tests passed across desktop-chromium and mobile-chromium:
     - Secondary scanner denied offline operation with operational warning banner (AC-40, O1).
     - Primary scanner downloads dataset and toggles offline mode with operational notice to stop other devices (O1/AC-40).
     - Missing ticket returns wait for online (AC-41, O2).
     - Full offline transition sequence: Entry -> Repeat Entry Denial -> Exit -> Repeat Exit Denial -> Reentry (AC-96, AC-50).
     - Pending sync counter updates accurately on each state transition (AC-42, AC-103).
     - Page reload maintains pending queue and preserves updated ticket states (AC-103).
     - Storage write failure fails scan without claiming success (AC-103).

4. **Lint, Typecheck & Standalone Build:**
   - Biome lint: 253 files checked, 0 errors, 0 warnings (`npm run lint`).
   - TypeScript typecheck: 0 errors (`npm run typecheck`).
   - Standalone Next.js build: 38 routes generated successfully (`npm run build`).

5. **Code Review Evidence (Mode: final):**
   - **Review Result:** Approved (0 findings).
   - **Criteria Verified:** AC-40, AC-41, AC-50, AC-96, AC-103, joint AC-42, AC-65.
   - **Behavioral & Safety checks:**
     - Primary-only offline enforcement (O1/AC-40) confirmed with secondary rejection and clear operational notice.
     - Missing / newly bought ticket handling (O2/AC-41) correctly rejects with wait-for-online prompt, never assuming valid or falsely reporting fake.
     - Offline state machine transitions (AC-96, AC-50) entry -> repeat denial -> exit -> repeat denial -> reentry verified with order preservation.
     - Atomic local storage persistence and write failure rollback (AC-103) strictly prevents false success claims and ensures queue preservation across page reload.
     - Zero buyer PII preserved in offline dataset, scanner API, and admission terminal UI (AC-65).
     - UI design compliance verified: Thai language, Kanit typography, pure SVG icons (zero emoji), 60/30/10 color palette, and mobile responsiveness.
