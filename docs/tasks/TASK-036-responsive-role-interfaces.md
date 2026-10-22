# TASK-036: ทุกบทบาทใช้หน้าจอตามธีม ภาษา และอุปกรณ์ที่ตกลงได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

หน้าลูกค้า หลังบ้าน และ scanner ทั้งวงจรที่ทำแล้วใช้งานหลักได้บนอุปกรณ์เป้าหมาย โดยคง mandatory design/locale contract ครบ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#design-contract), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0002](../adr/0002-local-first-and-aws-production.md)

## Blocked by

- TASK-008 — [เจ้าของเว็บเผยแพร่ข่าวให้ลูกค้าอ่านได้](TASK-008-public-news.md)
- TASK-019 — [เจ้าของเว็บแก้ข้อมูลติดต่อของ order ที่ชำระแล้วได้](TASK-019-owner-contact-correction.md)
- TASK-025 — [เลื่อนรอบโดยอนุมัติและเปิดช่วงคืนพิเศษได้](TASK-025-reschedule-refund-window.md)
- TASK-027 — [ยกเลิกรอบระหว่างรอชำระแล้วคืนเงินตรงตามเวลาจริงได้](TASK-027-cancel-pending-payments.md)
- TASK-030 — [เจ้าของเว็บปล่อยเงินสำรองหลังรอบสุดท้ายสิ้นสุดได้](TASK-030-reserve-release.md)
- TASK-031 — [ยอดติดลบและเงินรับคืนจากผู้จัดงานอยู่เฉพาะงานเดิมได้](TASK-031-event-debt-repayment.md)
- TASK-035 — [สลับเครื่องหลักเมื่อซิงก์ครบและหยุดออฟไลน์เมื่อข้อมูลหายได้](TASK-035-primary-handover-recovery.md)

## Todo

- [x] ส่งมอบและตรวจ AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-104 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ตรวจและปรับ reusable UI และแต่ละหน้าจริงของทุกบทบาทให้ตาม D-01/D-05/D-11–D-14 โดยไม่สร้าง prototype หรือ product feature ใหม่
- [x] รักษา white/black/blue UI 60/30/10 แยกโปสเตอร์ที่คงสีจริง Kanit ไอคอนแทนอิโมจิ semantic status มี text+icon; ไม่สร้าง tolerance pixel ratio หรือ design preference เป็นข้อบังคับเพิ่ม
- [x] ภาษาไทย THB และ Asia/Bangkok ใช้ทุกหน้าที่มีข้อความ/ยอด/เวลา โดยไม่ทำ deadline/refund cutoff เปลี่ยนตาม timezone ของอุปกรณ์
- [x] ใช้ D-02–D-04/D-06–D-10 เป็นแนวทางทบทวนภาพ เลือก NQ-02 tokens/browser baseline ในขอบเขตเดิม และบันทึกว่าเป็น implementation choices; ไม่เปิด design interview ใหม่
- [x] ทวน critical actions ใน customer mobile, back office desktop/mobile และ scanner mobile/tablet camera ให้ปุ่ม/ยอด/ผล/ฟอร์มไม่ถูกบัง โดยแก้การจัดวางที่พบจากหน้าจริง
- [x] Verification — E2E responsive/locale assertions ครอบคลุม home/search/news/checkout/OTP/payment/order/refund, owner/organizer และ scanner; รันด้วย device timezone ต่างจากไทยแล้วเวลาจริงและยอดยังถูก
- [x] Verification — Computed styles/content inspection + manual visual/device camera review ตรวจ Kanit/Thai diacritics/icons/semantic colors/poster originals และเข้าถึง critical controls ตาม D-05; ไม่ใช้ภาพ review แทน required automated critical journeys
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน — Review approved: `src/app/globals.css`, `tests/unit/responsive-role-interfaces.test.ts`, `tests/e2e/responsive-role-interfaces.spec.ts`; AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-104 verified; unit-test (180 passed), e2e-test (6 passed), lint, typecheck, build passed; no findings.
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

- Unit tests (`npm run test:unit`): 180 passed across 35 test files (รวม 4 tests ใน `tests/unit/responsive-role-interfaces.test.ts`)
- E2E tests (`npx playwright test tests/e2e/responsive-role-interfaces.spec.ts`): 6 passed across desktop-chromium และ mobile-chromium (รวม timezone browser UTC test)
- Lint (`npm run lint`): Biome 0 errors, 0 warnings across 269 files
- Typecheck (`npm run typecheck`): 0 errors
- Standalone build (`npm run build`): สำเร็จเรียบร้อยครบ 39 routes
