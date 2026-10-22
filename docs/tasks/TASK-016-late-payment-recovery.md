# TASK-016: เงินยืนยันล่าช้าถูกจัดสรรบัตรหรือเปิดเคสคืนเต็มยอดได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

ระบบแยก paid-time ที่ทันเส้นตายจาก callback ที่มาช้า และไม่ทำเงินหายเมื่อ quota ไม่พอหรือจ่ายจริงช้า

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- TASK-015 — [ชำระสำเร็จที่ตรวจแล้วออก QR แยกใบได้](TASK-015-paid-ticket-issuance.md)

## Todo

- [x] ส่งมอบและตรวจ AC-72, AC-73, AC-74 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] รอบไม่ยกเลิก: timely payment ที่ผลมาหลัง release ต้องจัดสรรใหม่ครบทุก type แบบ atomic หากพอจึง issue; ไม่แย่ง quota จากสิทธิ์ที่ order อื่นถืออยู่
- [x] ถ้า quota ไม่พอครบหรือ actual paid time หลัง deadline เดิม ให้ไม่ issue/ไม่ partial fulfill และเปิด owner review case คืนเต็ม received total รวม customer fee ตาม G-23/G-35
- [x] ทำ owner view ของ paid-but-not-issued/รอตรวจและเคสคืน exception พร้อมประวัติ payment/quote; การสร้างเคสไม่ใช่การโอน refund ซึ่งอยู่ TASK-023
- [x] retry/reconciliation ใช้ provider-verified time และผลเดิมไม่สร้าง ticket/เคสคืน/ยอดรับซ้ำ; รอบยกเลิกใช้ TASK-027 ภายหลัง
- [x] Verification — PostgreSQL/provider integration ควบคุมเวลาและ contention: callback ช้าพร้อม quota พอ/ประเภทหนึ่งไม่พอ, T=D/T>D, actual payment หลัง expiry แม้มี stock (`tests/integration/late-payment-recovery.test.ts` 3 tests passed)
- [x] Verification — E2E local: owner เห็น exception/ยอดเต็มที่ต้องตรวจ ลูกค้าเห็นสถานะตามจริง ไม่มี ticket บางส่วน และ repeat callback ไม่เพิ่มเคส (`tests/e2e/late-payment-recovery.spec.ts` 2 tests passed)
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] Review approved — working tree against HEAD; AC-72, AC-73, AC-74, G-23, G-35 verified; unit (99 passed, late-payment-recovery 3 passed), integration (53 passed, late-payment-recovery 3 passed), e2e (late-payment-recovery desktop/mobile 2 passed), typecheck (0 errors), lint (0 errors across 148 files), build passed; no findings.
- [x] Focused diff ready for review without unauthorized commit/push.
