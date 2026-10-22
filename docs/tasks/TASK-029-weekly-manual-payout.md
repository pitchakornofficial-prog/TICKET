# TASK-029: เจ้าของเว็บจ่ายรายสัปดาห์และบันทึกหลักฐานโดยไม่จ่ายยอดเดิมซ้ำได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

Owner บันทึก manual weekly payout จากยอดพร้อมจ่ายได้แม้งานยังขายอยู่ โดยหัก approved refund/fee/reserve/paid เดิมและปกป้องหลักฐาน

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- TASK-028 — [ผู้จัดงานอ่านยอดขาย ค่าบริการ และยอดพร้อมจ่ายของงานตนได้](TASK-028-organizer-money-report.md)
- TASK-023 — [เจ้าของเว็บบันทึกการโอนคืนและหลักฐานส่วนตัวได้](TASK-023-manual-refund-proof.md)

## Todo

- [x] ส่งมอบและตรวจ AC-27, AC-30, AC-31, AC-79, AC-87 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-92: สิทธิ์ไฟล์หลักฐาน payout ร่วม TASK-023; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-023 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ส่วนร่วม AC-93: manual payout failure/retry ร่วม TASK-023; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-023 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ทำ weekly payout cycle/owner UI จาก report ของ TASK-028; วันจริงเป็น configuration NQ-01 ไม่เดาวันจ่าย และไม่บังคับรอจบคอนเสิร์ต
- [x] ยอดแนะนำ/ที่บันทึกตาม flow ปกติไม่เกิน max(0,L-H); approved refund ลดสิทธิ์ตั้งแต่ approval ไม่ลดซ้ำตอน transfer สำเร็จ และ flat fee carry ถูกหักจนเต็มจากงานเดิม
- [x] Owner โอนนอกระบบแล้วบันทึก P/ยอด/หลักฐานจริง ไม่มี bank disbursement API; duplicate record/สอง request เดิมไม่หัก payable ซ้ำ และบันทึก failure ไม่เป็น completed
- [x] ใช้ private proof boundary จาก TASK-023 กับ payout: owner เปิดได้ organizer เห็นยอด/สถานะตนแต่ไม่เปิดไฟล์ buyer/scanner ไม่อ่าน payout proof; เงินโอนจริงคลาดกับยอดที่ระบบรองรับต้องแสดงให้ owner กระทบยอด ไม่อ้างว่า database ป้องกันคนโอนนอกระบบซ้ำได้
- [x] Verification — Unit/accounting integration controlled weekly cycles: งานยังไม่จบจ่ายได้ E=900/H=90 จ่าย810แล้วพร้อมจ่าย0, flat fee มากกว่ายอดแรก carry ไปครั้งถัดไปไม่เก็บเต็มซ้ำ (4 tests passed in tests/unit/weekly-manual-payout.test.ts)
- [x] Verification — Integration + E2E approval→payout→refund transfer, payout failure/duplicate/concurrency และ direct private proof access ทุก role; ตรวจ provider cost อยู่ owner และไม่มี external transfer API (4 integration tests passed in tests/integration/weekly-manual-payout.test.ts; 2 E2E tests passed in tests/e2e/weekly-manual-payout.spec.ts across desktop and mobile chromium)
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
- [x] Review approved — focused change against HEAD; AC-27, AC-30, AC-31, AC-79, AC-87, joint AC-92, AC-93 verified; unit-test (152 passed across 28 files, including 4 in weekly-manual-payout.test.ts), integration-test (100 passed across 29 files, including 4 in weekly-manual-payout.test.ts), e2e-test (2 passed across desktop-chromium and mobile-chromium in weekly-manual-payout.spec.ts), typecheck (0 errors), lint (0 errors across 233 files), build (standalone 38 routes) passed; no findings.
