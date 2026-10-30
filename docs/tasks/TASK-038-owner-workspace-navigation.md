# TASK-038: เมนูนำทางแบบกลุ่ม 4 หมวดและเลื่อนตารางแนวนอนในหลังบ้านเจ้าของเว็บ

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

ปรับปรุงโครงสร้างหน้าจอ `/back-office/owner` ให้มีเมนูนำทาง (Sidebar สำหรับ Desktop และแถบเปิดเมนูสำหรับ Mobile) โดยแบ่งผู้จัดการทั้ง 12 ตัวออกเป็น 4 หมวดหมู่ตาม D-15 และ D-16 แสดงเฉพาะเนื้อหาหมวดที่เลือก ไม่แสดงหน้ายาวต่อกันทั้งหมด พร้อมจัดตารางแสดงผลให้กระชับ (dense table) และครอบด้วยการเลื่อนแนวนอนบนจอมือถือ (table-responsive) ตาม D-18, D-19 และ AC-116 โดยรักษาแนวทางการออกแบบ D-11–D-14 และ D-20

อ้างอิง [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md), [D-15–D-20 ใน requirement.md](../requirement.md#ui-design-requirements), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md)

## Blocked by

- [TASK-036: ทุกบทบาทใช้หน้าจอตามธีม ภาษา และอุปกรณ์ที่ตกลงได้](TASK-036-responsive-role-interfaces.md)

## Todo

- [x] ส่งมอบผลลัพธ์ของ AC-116 ตามขอบเขตการจัดกลุ่มเมนูและการเลื่อนตารางแนวนอน
- [x] จัดกลุ่มผู้จัดการทั้ง 12 ตัวของ Owner ออกเป็น 4 หมวดหมู่อย่างเป็นระเบียบตาม D-16:
  - **อนุมัติ (Approval):** รอบการแสดง/แก้ไข/ยกเลิก (`OwnerSessionApprovalManager`), คำขอคืนเงิน (`OwnerRefundApprovalManager`)
  - **การเงิน (Finance):** ค่าบริการ/เงินสำรอง (`OwnerFeeSettingsManager`), จ่ายรายสัปดาห์ (`OwnerWeeklyPayoutManager`), ปล่อยเงินสำรอง (`OwnerReserveReleaseManager`), หนี้/เงินรับคืน (`OwnerDebtRepaymentManager`), เงินเข้าล่าช้า (`OwnerPaymentRecoveryManager`)
  - **ลูกค้า (Customer):** แก้ข้อมูลติดต่อผู้ซื้อ (`OwnerContactCorrectionManager`), อีเมลส่งไม่สำเร็จ (`OwnerEmailDeliveriesManager`)
  - **ระบบ (System):** เชิญผู้จัดงาน (`InviteOrganizerForm`), ข่าวสาร (`OwnerNewsManager`), ข้อมูลสแกนออฟไลน์ที่ขัดแย้ง (`OwnerSyncConflictManager`)
- [x] สร้างโครงสร้างเมนูนำทาง (Desktop Sidebar และ Mobile Menu Drawer/Toggle) ที่สลับหมวดหมู่และเรนเดอร์เฉพาะหมวดหมู่ที่เลือก (active section) ไม่เรนเดอร์ต่อกันยาวทั้ง 12 ตัว (`OwnerWorkspaceView` ใน `src/components/owner-workspace-view.tsx`)
- [x] รักษาส่วนหัว Workspace ของ Owner (`h1` หรือ title และข้อมูลผู้ใช้/ปุ่มออกจากระบบ) เพื่อคง backward compatibility สำหรับ E2E tests เดิม (`tests/e2e/back-office.spec.ts` ผ่านครบ 10 tests)
- [x] ปรับตารางในผู้จัดการต่างๆ ให้แสดงผลแบบ Dense table (แถวกระชับ, ตัวกรองด้านบน, ปุ่มแอ็กชันท้ายแถว) และรองรับ `.table-responsive` เลื่อนแนวนอนบนมือถือตาม D-18 และ D-19
- [x] ควบคุมคุณภาพ UI ตาม D-11–D-14 และ D-20: ฟอนต์ Kanit, โทนสี 60/30/10, ภาษาไทยล้วน, ห้ามใช้ emoji (ใช้ pure SVG icons เท่านั้น)
- [x] Verification — Unit/Integration/E2E: ทดสอบการสลับหมวดหมู่ทั้ง 4 หมวด, การแสดงผลเฉพาะหมวดที่เลือก, และความสมบูรณ์ของตารางบนทั้ง Desktop และ Mobile (`tests/unit/owner-workspace-navigation.test.ts` 3 passed, `tests/e2e/owner-workspace-navigation.spec.ts` 2 passed, `tests/e2e/back-office.spec.ts` 10 passed)
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ตาม Verification Policy ใน CONTEXT และบันทึกผลการตรวจสอบจริง (Biome lint 275 files passed, TypeScript typecheck 0 errors, Vitest unit 187 tests passed across 37 files, Next.js build 39 routes passed)
- [x] นำ focused change และ evidence เข้า code-review เพื่อตรวจสอบความถูกต้องก่อนสรุปงาน — Review approved: `src/components/owner-workspace-view.tsx`, `src/components/icons.tsx`, `src/app/globals.css`, `src/app/back-office/[role]/page.tsx`, `tests/unit/owner-workspace-navigation.test.ts`, `tests/e2e/owner-workspace-navigation.spec.ts`; ตรวจสอบแล้วครบถ้วนตาม AC-116, D-15, D-16, D-18, D-19, D-20, UI Guidelines (ภาษาไทย, Kanit, SVG icons ไร้ emoji, สี 60/30/10) และรักษา backward compatibility ร่วมกับ E2E ทั้งหมด

## Verification Evidence

- **Unit tests (`npm run test:unit`)**: ผ่าน 187 tests บน 37 test files (รวม 3 tests ใน `tests/unit/owner-workspace-navigation.test.ts`)
- **E2E tests (`tests/e2e/owner-workspace-navigation.spec.ts`)**: ผ่าน 2 tests ทั้งบน desktop-chromium (Sidebar switching 4 หมวด) และ mobile-chromium (Mobile toggle drawer & no document overflow)
- **E2E regression (`tests/e2e/back-office.spec.ts`)**: ผ่าน 10 tests ครบถ้วน (รักษา header, auth, session timeout, role checks)
- **E2E flow alignment**: อัปเดต `tests/e2e/owner-contact-correction.spec.ts`, `tests/e2e/weekly-manual-payout.spec.ts`, `tests/e2e/reserve-release.spec.ts`, `tests/e2e/debt-repayment.spec.ts` ให้สลับเข้าหมวดหมู่งานที่เกี่ยวข้อง (Customer/Finance) อย่างถูกต้อง
- **Lint (`npm run lint`)**: Biome ผ่าน 0 errors, 0 warnings บน 275 files
- **Typecheck (`npm run typecheck`)**: TypeScript ผ่าน 0 errors
- **Standalone build (`npm run build`)**: ผ่านครบถ้วน 39 routes พร้อม standalone assets
