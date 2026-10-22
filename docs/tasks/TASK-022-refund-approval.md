# TASK-022: เจ้าของเว็บอนุมัติคืนแล้วเพิกถอน QR และคืนโควตาได้ครั้งเดียว

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner อนุมัติคำขอที่ยังเข้าเกณฑ์และทำให้เฉพาะ ticket ที่คืนถูก revoke พร้อมบันทึก liability/คืน quota ณ approval

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-021 — [ลูกค้ายื่นคืนบางใบที่เข้าเงื่อนไขได้](TASK-021-refund-requests.md)
- TASK-016 — [เงินยืนยันล่าช้าถูกจัดสรรบัตรหรือเปิดเคสคืนเต็มยอดได้](TASK-016-late-payment-recovery.md)

## Todo

- [x] ส่งมอบและตรวจ AC-36, AC-88, AC-89, AC-90, AC-107 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ใช้ owner approval boundary กับ buyer requests และ exception cases ที่มีจาก TASK-016; ตรวจ admission ล่าสุดซ้ำก่อนอนุมัติ ไม่ให้ใบเคยเข้าแล้วได้รับ refund แม้ออกแล้ว
- [x] ทำ approval/revoke/refund liability/quota return แบบ transaction และ idempotent: คง pending validity ก่อนอนุมัติ คืน quota เฉพาะรอบที่ยังขาย ไม่เปิดขายรอบยกเลิก
- [x] เก็บ approved refund amount แยกจาก transfer completion เพื่อ TASK-028/TASK-029 คำนวณ E/กันยอดทันทีตาม G-36; ไม่หักยอดซ้ำเมื่อโอนสำเร็จ
- [x] ป้องกัน duplicate/overlapping request และ scan/approval race ไม่ให้ใบเดียวกันได้รับสิทธิ์ refund/entry ที่ขัดกติกา; การโอนเงินจริงอยู่ TASK-023
- [x] Verification — PostgreSQL integration: concurrent scan/approval, duplicate approval/requests และ release ซ้ำ ตรวจ QR/liability/quota เกิดครั้งเดียว
- [x] Verification — E2E: partial approval revoke เฉพาะใบก่อนโอน ส่วนใบอื่นและ pending request ยังทำงานตามกติกา; สแกนก่อน/หลัง approval ได้ผลตรง central state
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] Review approved — working tree against HEAD; AC-36, AC-88, AC-89, AC-90, AC-107 verified; unit, integration, e2e, lint, typecheck, build passed; no findings.
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

- `npm run lint`: ผ่าน 0 warnings 0 errors (Checked 193 files in 122ms)
- `npm run typecheck`: ผ่าน 0 errors (route types generated + tsc --noEmit)
- `npm run test:unit`: ผ่าน 120 tests ผ่านครบ 21 files (รวม `tests/unit/refund-approval.test.ts` 3 tests ใน 14.43s)
- `npm run test:integration -- tests/integration/refund-approval.test.ts`: ผ่าน 4 tests (952ms)
- `$env:PLAYWRIGHT_BROWSERS_PATH=".cache/ms-playwright"; npx playwright test tests/e2e/refund-approval.spec.ts`: ผ่าน 2 tests บน desktop-chromium (34.2s) และ mobile-chromium (26.7s)
- `npm run build`: standalone build สำเร็จครบ 36 routes
