# TASK-039: ภาพรวมงานค้างที่ต้องดำเนินการในหลังบ้านเจ้าของเว็บ

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

เพิ่มส่วนแสดงผลภาพรวม (Overview dashboard) ในหน้า `/back-office/owner` ที่รวบรวมตัวเลขสรุปงานค้างที่ต้องดำเนินการ (pending action item counts) 5 รายการ: 1) รอบ/คำขอแก้ไข/ยกเลิกรอบที่รออนุมัติ, 2) คำขอคืนเงินที่รอตรวจ, 3) อีเมลส่งไม่สำเร็จ, 4) เงินเข้าล่าช้า/ผิดปกติที่รอตรวจ, 5) ข้อมูลสแกนออฟไลน์ที่ขัดแย้ง พร้อมลิงก์หรือปุ่มคลิกเพื่อกระโดดไปยังเมนูหรือหมวดหมู่ที่เกี่ยวข้องทันทีตาม AC-115 และ D-17

อ้างอิง [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md), [D-15–D-20 ใน requirement.md](../requirement.md#ui-design-requirements), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md)

## Blocked by

- [x] [TASK-038: เมนูนำทางแบบกลุ่ม 4 หมวดและเลื่อนตารางแนวนอนในหลังบ้านเจ้าของเว็บ](TASK-038-owner-workspace-navigation.md)

## Todo

- [x] ส่งมอบผลลัพธ์ของ AC-115 ตามขอบเขตการแสดงตัวเลขสรุปงานค้างและการคลิกนำทาง
- [x] จัดเตรียม endpoint หรือฟังก์ชันสรุปจำนวนงานค้าง (overview pending counts) จากฐานข้อมูลกลาง ครอบคลุม:
  1. รอบ/แก้ไขรอบ/ยกเลิกรอบที่รออนุมัติ (`pending_sessions`, `pending_amendments`, `pending_cancellations`)
  2. คำขอคืนเงินที่รอตรวจ (`pending_refunds`)
  3. อีเมลส่งไม่สำเร็จ (`failed_email_deliveries`)
  4. เงินเข้าล่าช้า/ข้อยกเว้นการชำระเงินที่รอตรวจ (`payment_exceptions`)
  5. ข้อมูลสแกนออฟไลน์ที่ขัดแย้งที่ยังไม่ได้รับการคลี่คลาย (`sync_conflicts`)
- [x] ออกแบบและสร้างการ์ดภาพรวม (Overview metric cards) ที่ด้านบนของหน้าหลังบ้าน Owner แสดงจำนวนตัวเลขงานค้างอย่างชัดเจน พร้อมข้อความและ pure SVG icons
- [x] ใส่ความสามารถในการคลิกการ์ดแต่ละใบเพื่อสลับไปยังหมวดหมู่ที่เกี่ยวข้องใน Sidebar และเลื่อนโฟกัสไปยังผู้จัดการงานนั้นโดยอัตโนมัติ
- [x] ควบคุมคุณภาพ UI ตาม D-11–D-14 และ D-20: ฟอนต์ Kanit, โทนสี 60/30/10, ภาษาไทยล้วน, ห้ามใช้ emoji (ใช้ pure SVG icons เท่านั้น)
- [x] Verification — Unit/Integration/E2E: ทดสอบการคำนวณจำนวนงานค้างที่ถูกต้อง, การแสดงผลบน Dashboard, และการคลิกการ์ดเพื่อนำทางไปยังหมวดที่ถูกต้อง
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ตาม Verification Policy ใน CONTEXT และบันทึกผลการตรวจสอบจริง
- [x] นำ focused change และ evidence เข้า code-review เพื่อตรวจสอบความถูกต้องก่อนสรุปงาน — Review approved: Overview dashboard (AC-115, D-17); files inspected: src/server/overview.ts, src/app/api/owner/overview/route.ts, src/components/owner-overview-dashboard.tsx, src/components/owner-workspace-view.tsx, src/components/owner-session-approval-manager.tsx, src/components/owner-payment-recovery-manager.tsx, src/components/owner-email-deliveries-manager.tsx, tests/unit/owner-overview-counts.test.ts, tests/integration/owner-overview-counts.test.ts, tests/e2e/owner-overview-counts.spec.ts; verified live PostgreSQL aggregation across 5 action queues, 401/403 owner auth guards, responsive 5-card metric UI with pure SVGs, Kanit font, Thai language, zero emojis, click-to-section navigation with smooth scrolling, unit (3 passed), integration (2 passed), e2e (2 passed), lint (0 errors/warnings), typecheck (0 errors), standalone build (40 routes); no findings.

## Verification Evidence

- `npm run lint`: Biome ผ่าน 0 errors, 0 warnings ตรวจสอบ 281 ไฟล์
- `npm run typecheck`: Next route types + TypeScript ผ่าน 0 errors
- `npm run test:unit`: 190 tests passed across 38 files (รวม `tests/unit/owner-overview-counts.test.ts` 3 tests)
- `npm run test:integration`: PostgreSQL integration tests ผ่าน (รวม `tests/integration/owner-overview-counts.test.ts` 2 tests บนฐานข้อมูลจริง)
- `npx playwright test tests/e2e/owner-overview-counts.spec.ts`: 2 tests passed บน desktop-chromium และ mobile-chromium (รวม 35.0s)
- `npm run build`: Next.js standalone build ผ่าน 40 routes สมบูรณ์ (รวม `/api/owner/overview`)
