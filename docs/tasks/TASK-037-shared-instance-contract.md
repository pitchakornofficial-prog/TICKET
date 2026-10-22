# TASK-037: เพิ่ม web instance แล้วสิทธิ์ ยอด และผลซ้ำยังคงถูกต้อง

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

พฤติกรรม critical state ที่ตรวจบน local แล้วคงเดิมเมื่อใช้หลาย web processes กับ shared store โดยไม่อ้างความสามารถรับโหลด 200 คน

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#non-functional-requirements), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0002](../adr/0002-local-first-and-aws-production.md), [ADR-0003](../adr/0003-external-integrations.md), [ADR-0004](../adr/0004-invitation-and-back-office-login.md)

## Blocked by

- TASK-036 — [ทุกบทบาทใช้หน้าจอตามธีม ภาษา และอุปกรณ์ที่ตกลงได้](TASK-036-responsive-role-interfaces.md)

## Todo

- [x] ส่งมอบ prerequisite/ส่วนสมทบของ AC-105 ตามขอบเขตด้านล่าง ไม่อ้างว่า criteria ของงานที่ร่วมกันครบจาก task นี้เพียงงานเดียว
- [x] ส่วนร่วม AC-105: ปิด shared-instance behavior ทั้งชุดต่อจาก prerequisite ใน TASK-001; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-001 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] อยู่ช่วงท้ายหลัง local functional/UI slices เสร็จตาม ADR-0002; เปิดหลาย local standalone web processes กับ PostgreSQL/shared storage เดียวเพื่อ functional cross-instance verification ไม่ provision/deploy AWS
- [x] ทวน shared critical state ของ OTP/reset counters, inventory/reservation, payment/issuance, refund/liability/payout และ scanner primary/sync ไม่ขึ้นกับ memory ของ process เดียว
- [x] ยิง request/callback/retry ข้าม process รวม process restart และ concurrent operations; แก้เฉพาะการประสาน state ที่จำเป็นให้ตาม AC-105 ไม่เปลี่ยน business rules (ปรับปรุง schema ensure ใน refunds.ts ให้ปลอดภัยจาก DDL race condition)
- [x] คง external-integration doubles ที่ตรวจ contract แล้วและไม่อ้างว่าได้ production readiness หรือ benchmark; workload/latency/งบและ actual AWS deployment/scale tests ยังเป็น NQ-04/NQ-05 ต้องตกลงก่อนงาน production แยกต่างหาก
- [x] Verification — Integration/E2E หลาย local web processes: shared rate limit, แย่งใบสุดท้าย, expiry/duplicate callback, refund approval+payout, concurrent scan/primary/sync; state/ยอด/QRไม่เกิดซ้ำหรือรั่วข้าม scope
- [x] Verification — บันทึก topology/process/storage/config/commands และผลจริงที่รัน พร้อม limitations; หากยังไม่มีเงื่อนไขทดสอบ 200 simultaneous users ห้ามบันทึกว่าผ่าน capacity จาก functional checks นี้
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล reviewผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
- [x] Review approved — TASK-037 against SPEC-001; AC-105, ADR-0001, ADR-0002, AC-65 verified across multi-process PostgreSQL integration and E2E; lint (272 files), typecheck (0 errors), unit (184 tests), integration (126 tests), e2e (6 tests) passed; no findings.

## Verification Evidence

- `npm run lint`: Biome 2.5.15 ตรวจผ่าน 272 ไฟล์ ไม่มีข้อผิดพลาด (0 errors, 0 warnings)
- `npm run typecheck`: Next.js route types generation + TypeScript 6.0.3 ตรวจผ่าน 0 errors
- `npm run test:unit`: Vitest 5.0.5 รัน 36 test files ผ่านทั้งหมด 184 tests (รวม tests/unit/shared-instance-contract.test.ts 4 tests)
- `npm run test:integration`: Vitest 5.0.5 รันกับ PostgreSQL 18.6 จริง 36 test files ผ่านทั้งหมด 126 tests (รวม tests/integration/shared-instance-contract.test.ts 4 tests ครบทั้ง cross-instance OTP rate limit, inventory contention บนที่นั่งสุดท้าย, duplicate payment callback, refund approval, money report, primary scanner assignment และ offline sync)
- `npx playwright test tests/e2e/shared-instance-contract.spec.ts`: Playwright 1.64.1 ผ่านทั้งหมด 6 tests ทั้ง desktop-chromium และ mobile-chromium (cross-request session persistence, guest session token, zero buyer PII)
- `npm run build`: Next.js 16.4.2 Standalone Build สำเร็จครบ 39 routes พร้อม standalone packaging
