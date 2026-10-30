# SPEC-001 — Task plan

- Source: [SPEC-001 ready](../specs/SPEC-001-concert-ticket-lifecycle.md), G-01–G-52, 123 active ACs
- Planned at: 2026-10-20 (Asia/Bangkok); updated 2026-10-22 (change-scope เพิ่ม TASK-038 และ TASK-039); updated 2026-10-23 (change-scope เพิ่ม TASK-040)
- Result: สร้าง TASK-001–TASK-037 เดิม 37 งาน และเพิ่ม TASK-038–TASK-040 รวม 40 งาน; เพิ่ม TASK-041–044 สำหรับ Stripe วันที่ 2026-10-30 รวม 44 งาน
- Initial state: ทุก task เริ่ม `todo` และ Todo ทุกข้อยังไม่ตรวจสำเร็จ; สถานะ/evidence ปัจจุบันดูในไฟล์ task โดยตรง
- Ownership: ดัชนีนี้เป็นแผนและ acceptance mapping ไม่ใช่ implementation หรือ test/code-coverage report

## Stripe follow-up (2026-10-30)

ข้อตกลง [Stripe PromptPay/P1–P4](../adr/0003-external-integrations.md#payment-provider-change--2026-10-30)
และ SPEC-001/AC-118–123 ถูกแตกเป็น TASK-041–044 แล้ว; ทั้งสี่งานเริ่ม todo โดยยังไม่มี implementation/test pass
TASK-001–040 คงสถานะ done และไฟล์เดิมทุกไฟล์; หลักฐาน Omise/local double เดิมไม่รับรอง Stripe
AC เดิมที่ได้รับผลกระทบมี follow-up/re-verification เพิ่มใน acceptance table โดยไม่ลบการส่งมอบเดิม
TASK-041 เป็น contract spike ไม่ปิด user-facing AC; ถ้าพิสูจน์ paid-time contract ไม่ได้ให้บล็อก boundary พร้อมเหตุ ไม่สมมติว่าทำได้

## Working contract

อ่าน [AGENTS](../../AGENTS.md), [CONTEXT/policy](../../CONTEXT.md#verification-policy), source spec และเอกสารที่ task ลิงก์ก่อนเริ่ม
unit/integration/E2E/code-review เป็น required เมื่อเกี่ยวข้อง ไม่มี runner ที่เกี่ยวข้องหรือไม่ผ่านต้องบล็อก ไม่เปลี่ยนนโยบายเพื่อให้ผ่าน
TASK-001 เลือก/สร้าง configuration และบันทึกคำสั่งจริง ภายหลังทุก task ใช้คำสั่งที่ตรวจจาก repository แทนการเดา
ไม่ commit/push/init Git อัตโนมัติ ไม่มีการอ้าง branch/commit จาก metadata ที่ใช้ไม่ได้
ไม่เปิด implement-task หรือ skill ถัดไปเองจากการสร้างแผน

## Task index

ทุกงานเป็น vertical behavior slice ยกเว้น TASK-001 ซึ่งเป็น local/runtime/test/shared-store prerequisite ที่จำเป็นตาม ADR-0001
TASK-037 เป็น late cross-instance functional contract ตาม AC-105; dependencies ที่เป็น transitive ถูกตัดออกเพื่อไม่สร้างลำดับบังคับเกินจริง

| Task | ผลลัพธ์ | Blocked by | AC scope |
| --- | --- | --- | --- |
| [TASK-001](TASK-001-local-foundation.md) | เปิดแอป TICKET และตรวจสอบการพัฒนาบน local ได้ | None | ร่วม: AC-105 |
| [TASK-002](TASK-002-owner-login.md) | เจ้าของเว็บเริ่มบัญชีภายในและล็อกอินตามบทบาทได้ | [TASK-001](TASK-001-local-foundation.md) | เต็ม: AC-51; ร่วม: AC-54 |
| [TASK-003](TASK-003-password-reset.md) | บัญชีหลังบ้านตั้งรหัสผ่านใหม่ทางอีเมลได้ | [TASK-002](TASK-002-owner-login.md) | เต็ม: AC-55, AC-56; ร่วม: AC-54 |
| [TASK-004](TASK-004-organizer-invitations.md) | เจ้าของเว็บเชิญผู้จัดงานเข้าระบบได้ | [TASK-003](TASK-003-password-reset.md) | เต็ม: AC-52, AC-53 |
| [TASK-005](TASK-005-event-drafts.md) | ผู้จัดงานบันทึกงาน รอบ และประเภทบัตรของตนได้ | [TASK-004](TASK-004-organizer-invitations.md) | ร่วม: AC-07 |
| [TASK-006](TASK-006-session-approval.md) | เจ้าของเว็บอนุมัติรอบให้เปิดขายแยกกันได้ | [TASK-005](TASK-005-event-drafts.md) | เต็ม: AC-02, AC-05, AC-66 |
| [TASK-007](TASK-007-public-concert-catalog.md) | ลูกค้าค้นหาและเปิดรายละเอียดคอนเสิร์ตได้ | [TASK-006](TASK-006-session-approval.md) | เต็ม: AC-01, AC-03 |
| [TASK-008](TASK-008-public-news.md) | เจ้าของเว็บเผยแพร่ข่าวให้ลูกค้าอ่านได้ | [TASK-002](TASK-002-owner-login.md) | เต็ม: AC-04 |
| [TASK-009](TASK-009-scanner-accounts.md) | ผู้จัดงานเพิ่มทีมสแกนเฉพาะงานได้ | [TASK-005](TASK-005-event-drafts.md) | เต็ม: AC-09 |
| [TASK-010](TASK-010-event-fee-settings.md) | เจ้าของเว็บตั้งค่าบริการและเงินสำรองรายงานได้ | [TASK-005](TASK-005-event-drafts.md) | เต็ม: AC-23, AC-24, AC-25, AC-29 |
| [TASK-011](TASK-011-guest-email-verification.md) | ลูกค้ากรอกข้อมูลและยืนยันอีเมลโดยไม่สมัครสมาชิกได้ | [TASK-007](TASK-007-public-concert-catalog.md) | เต็ม: AC-57, AC-58, AC-59, AC-60 |
| [TASK-012](TASK-012-reserve-tickets.md) | ลูกค้ายืนยันจำนวนแล้วกันบัตรครบทุกประเภทได้ | [TASK-011](TASK-011-guest-email-verification.md), [TASK-010](TASK-010-event-fee-settings.md) | เต็ม: AC-10, AC-14, AC-61, AC-69, AC-106, AC-111; ร่วม: AC-06, AC-12, AC-13 |
| [TASK-013](TASK-013-reservation-expiry.md) | reservation หมดเวลาแล้วคืนโควตาโดยไม่ต่ออายุได้ | [TASK-012](TASK-012-reserve-tickets.md) | เต็ม: AC-71; ร่วม: AC-70 |
| [TASK-014](TASK-014-payment-qr.md) | ลูกค้าสร้าง QR ชำระ order เดิมได้อย่างถูกต้อง | [TASK-013](TASK-013-reservation-expiry.md) | เต็ม: AC-15, AC-26; ร่วม: AC-12, AC-13, AC-70 |
| [TASK-015](TASK-015-paid-ticket-issuance.md) | ชำระสำเร็จที่ตรวจแล้วออก QR แยกใบได้ | [TASK-014](TASK-014-payment-qr.md) | เต็ม: AC-11, AC-16, AC-17, AC-18, AC-19; ร่วม: AC-06 |
| [TASK-016](TASK-016-late-payment-recovery.md) | เงินยืนยันล่าช้าถูกจัดสรรบัตรหรือเปิดเคสคืนเต็มยอดได้ | [TASK-015](TASK-015-paid-ticket-issuance.md) | เต็ม: AC-72, AC-73, AC-74 |
| [TASK-017](TASK-017-ticket-email-delivery.md) | ผู้ซื้อได้รับอีเมลบัตรและติดตามการส่งที่ล้มเหลวได้ | [TASK-015](TASK-015-paid-ticket-issuance.md) | เต็ม: AC-20; ร่วม: AC-75 |
| [TASK-018](TASK-018-guest-order-lookup.md) | ผู้ซื้อค้นหาและเปิดบัตรของตนหลัง OTP ได้ | [TASK-017](TASK-017-ticket-email-delivery.md) | เต็ม: AC-22, AC-62, AC-63; ร่วม: AC-21, AC-75 |
| [TASK-019](TASK-019-owner-contact-correction.md) | เจ้าของเว็บแก้ข้อมูลติดต่อของ order ที่ชำระแล้วได้ | [TASK-018](TASK-018-guest-order-lookup.md) | เต็ม: AC-76 |
| [TASK-020](TASK-020-online-admission.md) | ทีมสแกนบันทึกเข้า ออก และกลับเข้าแบบออนไลน์ได้ | [TASK-009](TASK-009-scanner-accounts.md), [TASK-015](TASK-015-paid-ticket-issuance.md) | เต็ม: AC-08, AC-39, AC-49, AC-95, AC-100, AC-101; ร่วม: AC-65 |
| [TASK-021](TASK-021-refund-requests.md) | ลูกค้ายื่นคืนบางใบที่เข้าเงื่อนไขได้ | [TASK-018](TASK-018-guest-order-lookup.md), [TASK-020](TASK-020-online-admission.md) | เต็ม: AC-32, AC-33, AC-34; ร่วม: AC-21 |
| [TASK-022](TASK-022-refund-approval.md) | เจ้าของเว็บอนุมัติคืนแล้วเพิกถอน QR และคืนโควตาได้ครั้งเดียว | [TASK-021](TASK-021-refund-requests.md), [TASK-016](TASK-016-late-payment-recovery.md) | เต็ม: AC-36, AC-88, AC-89, AC-90, AC-107 |
| [TASK-023](TASK-023-manual-refund-proof.md) | เจ้าของเว็บบันทึกการโอนคืนและหลักฐานส่วนตัวได้ | [TASK-022](TASK-022-refund-approval.md) | เต็ม: AC-37; ร่วม: AC-92, AC-93 |
| [TASK-024](TASK-024-approved-live-edits.md) | การแก้รอบที่เปิดขายมีผลเมื่ออนุมัติและรักษาสิทธิ์เดิม | [TASK-015](TASK-015-paid-ticket-issuance.md) | เต็ม: AC-67, AC-68, AC-109 |
| [TASK-025](TASK-025-reschedule-refund-window.md) | เลื่อนรอบโดยอนุมัติและเปิดช่วงคืนพิเศษได้ | [TASK-024](TASK-024-approved-live-edits.md), [TASK-021](TASK-021-refund-requests.md) | เต็ม: AC-38; ร่วม: AC-108 |
| [TASK-026](TASK-026-cancel-issued-session.md) | ยกเลิกรอบแล้วสร้างรายการรอคืนสำหรับบัตรที่เข้าเกณฑ์ได้ | [TASK-022](TASK-022-refund-approval.md) | เต็ม: AC-35, AC-91; ร่วม: AC-108 |
| [TASK-027](TASK-027-cancel-pending-payments.md) | ยกเลิกรอบระหว่างรอชำระแล้วคืนเงินตรงตามเวลาจริงได้ | [TASK-026](TASK-026-cancel-issued-session.md) | เต็ม: AC-112, AC-113, AC-114; ร่วม: AC-84 |
| [TASK-028](TASK-028-organizer-money-report.md) | ผู้จัดงานอ่านยอดขาย ค่าบริการ และยอดพร้อมจ่ายของงานตนได้ | [TASK-026](TASK-026-cancel-issued-session.md) | เต็ม: AC-28, AC-64, AC-77, AC-78, AC-80, AC-81, AC-82, AC-110; ร่วม: AC-07, AC-84 |
| [TASK-029](TASK-029-weekly-manual-payout.md) | เจ้าของเว็บจ่ายรายสัปดาห์และบันทึกหลักฐานโดยไม่จ่ายยอดเดิมซ้ำได้ | [TASK-028](TASK-028-organizer-money-report.md), [TASK-023](TASK-023-manual-refund-proof.md) | เต็ม: AC-27, AC-30, AC-31, AC-79, AC-87; ร่วม: AC-92, AC-93 |
| [TASK-030](TASK-030-reserve-release.md) | เจ้าของเว็บปล่อยเงินสำรองหลังรอบสุดท้ายสิ้นสุดได้ | [TASK-028](TASK-028-organizer-money-report.md) | เต็ม: AC-83 |
| [TASK-031](TASK-031-event-debt-repayment.md) | ยอดติดลบและเงินรับคืนจากผู้จัดงานอยู่เฉพาะงานเดิมได้ | [TASK-029](TASK-029-weekly-manual-payout.md) | เต็ม: AC-85, AC-86 |
| [TASK-032](TASK-032-offline-primary-dataset.md) | ผู้จัดงานกำหนดเครื่องหลักและเตรียมข้อมูลออฟไลน์เฉพาะงานได้ | [TASK-020](TASK-020-online-admission.md) | เต็ม: AC-94; ร่วม: AC-65 |
| [TASK-033](TASK-033-offline-admission.md) | เครื่องหลักสแกนเข้า ออก และกลับเข้าโดยออฟไลน์ได้ | [TASK-032](TASK-032-offline-primary-dataset.md) | เต็ม: AC-40, AC-41, AC-50, AC-96, AC-103; ร่วม: AC-42 |
| [TASK-034](TASK-034-offline-sync-conflicts.md) | ผลออฟไลน์ซิงก์กลับครั้งเดียวและแจ้งข้อมูลขัดแย้งได้ | [TASK-033](TASK-033-offline-admission.md), [TASK-022](TASK-022-refund-approval.md) | เต็ม: AC-99, AC-102; ร่วม: AC-42 |
| [TASK-035](TASK-035-primary-handover-recovery.md) | สลับเครื่องหลักเมื่อซิงก์ครบและหยุดออฟไลน์เมื่อข้อมูลหายได้ | [TASK-034](TASK-034-offline-sync-conflicts.md) | เต็ม: AC-97, AC-98 |
| [TASK-036](TASK-036-responsive-role-interfaces.md) | ทุกบทบาทใช้หน้าจอตามธีม ภาษา และอุปกรณ์ที่ตกลงได้ | [TASK-008](TASK-008-public-news.md), [TASK-019](TASK-019-owner-contact-correction.md), [TASK-025](TASK-025-reschedule-refund-window.md), [TASK-027](TASK-027-cancel-pending-payments.md), [TASK-030](TASK-030-reserve-release.md), [TASK-031](TASK-031-event-debt-repayment.md), [TASK-035](TASK-035-primary-handover-recovery.md) | เต็ม: AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-104 |
| [TASK-037](TASK-037-shared-instance-contract.md) | เพิ่ม web instance แล้วสิทธิ์ ยอด และผลซ้ำยังคงถูกต้อง | [TASK-036](TASK-036-responsive-role-interfaces.md) | ร่วม: AC-105 |
| [TASK-038](TASK-038-owner-workspace-navigation.md) | เจ้าของเว็บใช้งานหลังบ้านผ่านเมนูกลุ่ม 4 หมวดและเลื่อนตารางแนวนอนได้ | [TASK-036](TASK-036-responsive-role-interfaces.md) | เต็ม: AC-116 |
| [TASK-039](TASK-039-owner-overview-counts.md) | เจ้าของเว็บติดตามตัวเลขสรุปงานค้างและคลิกนำทางไปยังส่วนงานได้ | [TASK-038](TASK-038-owner-workspace-navigation.md) | เต็ม: AC-115 |
| [TASK-040](TASK-040-multi-step-purchase-journey.md) | ลูกค้าซื้อบัตรผ่าน 4 หน้าพร้อมห้องรอคิวและ Step Indicator | [TASK-015](TASK-015-paid-ticket-issuance.md), [TASK-036](TASK-036-responsive-role-interfaces.md) | เต็ม: AC-117 |

| [TASK-041](TASK-041-stripe-promptpay-contract.md) | พิสูจน์ QR/paid-time/expiry/cancellation contract ของ Stripe (spike) | None | prerequisite ของ AC-118–123; ไม่ปิด AC เอง |
| [TASK-042](TASK-042-stripe-promptpay-qr.md) | ผู้ซื้อแสดง Stripe QR ในหน้าเดิมโดยไม่สร้างรายการซ้ำ | [TASK-041](TASK-041-stripe-promptpay-contract.md) | เต็ม: AC-118; ร่วม: AC-120, AC-123; re-verify AC-15/26/70 และ guards AC-12/13 |
| [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) | ผล Stripe ที่ตรวจแล้วออกบัตรครั้งเดียวและแยก test/live | [TASK-042](TASK-042-stripe-promptpay-qr.md) | เต็ม: AC-119; ร่วม: AC-120, AC-122, AC-123; re-verify AC-16/17/18 |
| [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | หมดเวลา/ยกเลิกและ late-payment recovery ตาม D/C/T | [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) | เต็ม: AC-121; ร่วม: AC-120, AC-122; re-verify AC-71–74/112–114; regression AC-37/84/93 |

## Acceptance coverage

ครอบคลุมแผน 123/123 AC; AC-01–117 คง mapping เดิมและมี Stripe follow-up ตามแถวที่ระบุ ส่วน AC-118–123 เป็นงานใหม่ ไม่ถือว่าการมีแผนหรือ done เดิมเท่ากับผ่าน Stripe
`เต็ม` = task นั้นรับผิดชอบ outcome ของ AC ครบโดยอาศัย prerequisites ที่ระบุ; `ร่วม` = ทุก task ในแถวต้องส่งมอบส่วนของตนจึงถือว่า AC ครบ
ทุก joint contribution เขียนขอบเขตไว้ใน Todo ของ task ทั้งสองด้าน ไม่ใช้ผลทดสอบของส่วนหนึ่งอ้างว่าผลงานอีกส่วนเสร็จแล้ว
ข้อความ AC และ verification target ฉบับหลักอยู่ใน [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md#acceptance-criteria) ไม่มี AC ใหม่จากการวางแผน

| AC | Tasks | การปิด coverage |
| --- | --- | --- |
| AC-01 | [TASK-007](TASK-007-public-concert-catalog.md) | เต็มใน [TASK-007](TASK-007-public-concert-catalog.md) |
| AC-02 | [TASK-006](TASK-006-session-approval.md) | เต็มใน [TASK-006](TASK-006-session-approval.md) |
| AC-03 | [TASK-007](TASK-007-public-concert-catalog.md) | เต็มใน [TASK-007](TASK-007-public-concert-catalog.md) |
| AC-04 | [TASK-008](TASK-008-public-news.md) | เต็มใน [TASK-008](TASK-008-public-news.md) |
| AC-05 | [TASK-006](TASK-006-session-approval.md) | เต็มใน [TASK-006](TASK-006-session-approval.md) |
| AC-06 | [TASK-012](TASK-012-reserve-tickets.md), [TASK-015](TASK-015-paid-ticket-issuance.md) | ร่วมทั้งหมด: TASK-012 — แยก quota ระหว่างรอบตอน reserve; TASK-015 ตรวจตอนขาย/issue; TASK-015 — การเปลี่ยน reserved→issued ไม่กระทบรอบอื่น ร่วม TASK-012 |
| AC-07 | [TASK-005](TASK-005-event-drafts.md), [TASK-028](TASK-028-organizer-money-report.md) | ร่วมทั้งหมด: TASK-005 — ส่วนการอ่าน/แก้ข้อมูลงานข้าม organizer; TASK-028 เติมการปฏิเสธอ่านรายงานของผู้อื่น; TASK-028 — ส่วน report ownership ร่วม TASK-005 ที่ตรวจ event read/write |
| AC-08 | [TASK-020](TASK-020-online-admission.md) | เต็มใน [TASK-020](TASK-020-online-admission.md) |
| AC-09 | [TASK-009](TASK-009-scanner-accounts.md) | เต็มใน [TASK-009](TASK-009-scanner-accounts.md) |
| AC-10 | [TASK-012](TASK-012-reserve-tickets.md) | เต็มใน [TASK-012](TASK-012-reserve-tickets.md) |
| AC-11 | [TASK-015](TASK-015-paid-ticket-issuance.md) | เต็มใน [TASK-015](TASK-015-paid-ticket-issuance.md) |
| AC-12 | [TASK-012](TASK-012-reserve-tickets.md), [TASK-014](TASK-014-payment-qr.md), [TASK-042](TASK-042-stripe-promptpay-qr.md) | ประวัติเดิม: ร่วมทั้งหมด: TASK-012 — ปฏิเสธ reservation เมื่อ OTP ยังไม่ผ่าน; TASK-014 ตรวจ payment request guard จริง; TASK-014 — ปฏิเสธ direct payment request ที่ OTP ยังไม่ผ่าน ร่วม reservation gate ของ TASK-012; Stripe follow-up: [TASK-042](TASK-042-stripe-promptpay-qr.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-13 | [TASK-012](TASK-012-reserve-tickets.md), [TASK-014](TASK-014-payment-qr.md), [TASK-042](TASK-042-stripe-promptpay-qr.md) | ประวัติเดิม: ร่วมทั้งหมด: TASK-012 — เริ่ม deadline หลัง OTP+confirm; TASK-014 ตรวจ guard ก่อนสร้าง QR; TASK-014 — บังคับ reservation เริ่มแล้วก่อน QR ร่วม TASK-012; Stripe follow-up: [TASK-042](TASK-042-stripe-promptpay-qr.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-14 | [TASK-012](TASK-012-reserve-tickets.md) | เต็มใน [TASK-012](TASK-012-reserve-tickets.md) |
| AC-15 | [TASK-014](TASK-014-payment-qr.md), [TASK-042](TASK-042-stripe-promptpay-qr.md) | ประวัติเดิม: เต็มใน [TASK-014](TASK-014-payment-qr.md); Stripe follow-up: [TASK-042](TASK-042-stripe-promptpay-qr.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-16 | [TASK-015](TASK-015-paid-ticket-issuance.md), [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) | ประวัติเดิม: เต็มใน [TASK-015](TASK-015-paid-ticket-issuance.md); Stripe follow-up: [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-17 | [TASK-015](TASK-015-paid-ticket-issuance.md), [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) | ประวัติเดิม: เต็มใน [TASK-015](TASK-015-paid-ticket-issuance.md); Stripe follow-up: [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-18 | [TASK-015](TASK-015-paid-ticket-issuance.md), [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) | ประวัติเดิม: เต็มใน [TASK-015](TASK-015-paid-ticket-issuance.md); Stripe follow-up: [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-19 | [TASK-015](TASK-015-paid-ticket-issuance.md) | เต็มใน [TASK-015](TASK-015-paid-ticket-issuance.md) |
| AC-20 | [TASK-017](TASK-017-ticket-email-delivery.md) | เต็มใน [TASK-017](TASK-017-ticket-email-delivery.md) |
| AC-21 | [TASK-018](TASK-018-guest-order-lookup.md), [TASK-021](TASK-021-refund-requests.md) | ร่วมทั้งหมด: TASK-018 — ส่วนเปิด order/ticket ของตน; TASK-021 เติมเริ่มคำขอ refund; TASK-021 — ส่วนเริ่มคำขอคืนจาก order ตน ร่วม TASK-018 |
| AC-22 | [TASK-018](TASK-018-guest-order-lookup.md) | เต็มใน [TASK-018](TASK-018-guest-order-lookup.md) |
| AC-23 | [TASK-010](TASK-010-event-fee-settings.md) | เต็มใน [TASK-010](TASK-010-event-fee-settings.md) |
| AC-24 | [TASK-010](TASK-010-event-fee-settings.md) | เต็มใน [TASK-010](TASK-010-event-fee-settings.md) |
| AC-25 | [TASK-010](TASK-010-event-fee-settings.md) | เต็มใน [TASK-010](TASK-010-event-fee-settings.md) |
| AC-26 | [TASK-014](TASK-014-payment-qr.md), [TASK-042](TASK-042-stripe-promptpay-qr.md) | ประวัติเดิม: เต็มใน [TASK-014](TASK-014-payment-qr.md); Stripe follow-up: [TASK-042](TASK-042-stripe-promptpay-qr.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-27 | [TASK-029](TASK-029-weekly-manual-payout.md) | เต็มใน [TASK-029](TASK-029-weekly-manual-payout.md) |
| AC-28 | [TASK-028](TASK-028-organizer-money-report.md) | เต็มใน [TASK-028](TASK-028-organizer-money-report.md) |
| AC-29 | [TASK-010](TASK-010-event-fee-settings.md) | เต็มใน [TASK-010](TASK-010-event-fee-settings.md) |
| AC-30 | [TASK-029](TASK-029-weekly-manual-payout.md) | เต็มใน [TASK-029](TASK-029-weekly-manual-payout.md) |
| AC-31 | [TASK-029](TASK-029-weekly-manual-payout.md) | เต็มใน [TASK-029](TASK-029-weekly-manual-payout.md) |
| AC-32 | [TASK-021](TASK-021-refund-requests.md) | เต็มใน [TASK-021](TASK-021-refund-requests.md) |
| AC-33 | [TASK-021](TASK-021-refund-requests.md) | เต็มใน [TASK-021](TASK-021-refund-requests.md) |
| AC-34 | [TASK-021](TASK-021-refund-requests.md) | เต็มใน [TASK-021](TASK-021-refund-requests.md) |
| AC-35 | [TASK-026](TASK-026-cancel-issued-session.md) | เต็มใน [TASK-026](TASK-026-cancel-issued-session.md) |
| AC-36 | [TASK-022](TASK-022-refund-approval.md) | เต็มใน [TASK-022](TASK-022-refund-approval.md) |
| AC-37 | [TASK-023](TASK-023-manual-refund-proof.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: เต็มใน [TASK-023](TASK-023-manual-refund-proof.md); Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-38 | [TASK-025](TASK-025-reschedule-refund-window.md) | เต็มใน [TASK-025](TASK-025-reschedule-refund-window.md) |
| AC-39 | [TASK-020](TASK-020-online-admission.md) | เต็มใน [TASK-020](TASK-020-online-admission.md) |
| AC-40 | [TASK-033](TASK-033-offline-admission.md) | เต็มใน [TASK-033](TASK-033-offline-admission.md) |
| AC-41 | [TASK-033](TASK-033-offline-admission.md) | เต็มใน [TASK-033](TASK-033-offline-admission.md) |
| AC-42 | [TASK-033](TASK-033-offline-admission.md), [TASK-034](TASK-034-offline-sync-conflicts.md) | ร่วมทั้งหมด: TASK-033 — แสดง connectivity/last sync/pending local results; TASK-034 เติม pending/last-sync หลัง reconnect; TASK-034 — pending/last-sync หลัง reconnect ตามผลรับจริง ร่วม TASK-033 |
| AC-43 | [TASK-036](TASK-036-responsive-role-interfaces.md) | เต็มใน [TASK-036](TASK-036-responsive-role-interfaces.md) |
| AC-44 | [TASK-036](TASK-036-responsive-role-interfaces.md) | เต็มใน [TASK-036](TASK-036-responsive-role-interfaces.md) |
| AC-45 | [TASK-036](TASK-036-responsive-role-interfaces.md) | เต็มใน [TASK-036](TASK-036-responsive-role-interfaces.md) |
| AC-46 | [TASK-036](TASK-036-responsive-role-interfaces.md) | เต็มใน [TASK-036](TASK-036-responsive-role-interfaces.md) |
| AC-47 | [TASK-036](TASK-036-responsive-role-interfaces.md) | เต็มใน [TASK-036](TASK-036-responsive-role-interfaces.md) |
| AC-48 | [TASK-036](TASK-036-responsive-role-interfaces.md) | เต็มใน [TASK-036](TASK-036-responsive-role-interfaces.md) |
| AC-49 | [TASK-020](TASK-020-online-admission.md) | เต็มใน [TASK-020](TASK-020-online-admission.md) |
| AC-50 | [TASK-033](TASK-033-offline-admission.md) | เต็มใน [TASK-033](TASK-033-offline-admission.md) |
| AC-51 | [TASK-002](TASK-002-owner-login.md) | เต็มใน [TASK-002](TASK-002-owner-login.md) |
| AC-52 | [TASK-004](TASK-004-organizer-invitations.md) | เต็มใน [TASK-004](TASK-004-organizer-invitations.md) |
| AC-53 | [TASK-004](TASK-004-organizer-invitations.md) | เต็มใน [TASK-004](TASK-004-organizer-invitations.md) |
| AC-54 | [TASK-002](TASK-002-owner-login.md), [TASK-003](TASK-003-password-reset.md) | ร่วมทั้งหมด: TASK-002 — เส้นทาง login ของ owner/organizer/scanner; TASK-003 เติม password reset; TASK-003 — ทำ reset ของทั้งสาม role ให้ครบต่อจาก login ใน TASK-002 |
| AC-55 | [TASK-003](TASK-003-password-reset.md) | เต็มใน [TASK-003](TASK-003-password-reset.md) |
| AC-56 | [TASK-003](TASK-003-password-reset.md) | เต็มใน [TASK-003](TASK-003-password-reset.md) |
| AC-57 | [TASK-011](TASK-011-guest-email-verification.md) | เต็มใน [TASK-011](TASK-011-guest-email-verification.md) |
| AC-58 | [TASK-011](TASK-011-guest-email-verification.md) | เต็มใน [TASK-011](TASK-011-guest-email-verification.md) |
| AC-59 | [TASK-011](TASK-011-guest-email-verification.md) | เต็มใน [TASK-011](TASK-011-guest-email-verification.md) |
| AC-60 | [TASK-011](TASK-011-guest-email-verification.md) | เต็มใน [TASK-011](TASK-011-guest-email-verification.md) |
| AC-61 | [TASK-012](TASK-012-reserve-tickets.md) | เต็มใน [TASK-012](TASK-012-reserve-tickets.md) |
| AC-62 | [TASK-018](TASK-018-guest-order-lookup.md) | เต็มใน [TASK-018](TASK-018-guest-order-lookup.md) |
| AC-63 | [TASK-018](TASK-018-guest-order-lookup.md) | เต็มใน [TASK-018](TASK-018-guest-order-lookup.md) |
| AC-64 | [TASK-028](TASK-028-organizer-money-report.md) | เต็มใน [TASK-028](TASK-028-organizer-money-report.md) |
| AC-65 | [TASK-020](TASK-020-online-admission.md), [TASK-032](TASK-032-offline-primary-dataset.md) | ร่วมทั้งหมด: TASK-020 — online ticket/scan response ไม่มี buyer PII; TASK-032 ตรวจ offline dataset; TASK-032 — offline dataset มีเฉพาะข้อมูล scanner scope ร่วม TASK-020 ที่ตรวจ online response |
| AC-66 | [TASK-006](TASK-006-session-approval.md) | เต็มใน [TASK-006](TASK-006-session-approval.md) |
| AC-67 | [TASK-024](TASK-024-approved-live-edits.md) | เต็มใน [TASK-024](TASK-024-approved-live-edits.md) |
| AC-68 | [TASK-024](TASK-024-approved-live-edits.md) | เต็มใน [TASK-024](TASK-024-approved-live-edits.md) |
| AC-69 | [TASK-012](TASK-012-reserve-tickets.md) | เต็มใน [TASK-012](TASK-012-reserve-tickets.md) |
| AC-70 | [TASK-013](TASK-013-reservation-expiry.md), [TASK-014](TASK-014-payment-qr.md), [TASK-042](TASK-042-stripe-promptpay-qr.md) | ประวัติเดิม: ร่วมทั้งหมด: TASK-013 — คง order/deadline เมื่อ refresh; TASK-014 ตรวจ repeated payment/QR creation ไม่ต่อเวลา; TASK-014 — ใช้ order/remaining time เดิมสำหรับ payment/QR ร่วม TASK-013; Stripe follow-up: [TASK-042](TASK-042-stripe-promptpay-qr.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-71 | [TASK-013](TASK-013-reservation-expiry.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: เต็มใน [TASK-013](TASK-013-reservation-expiry.md); Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-72 | [TASK-016](TASK-016-late-payment-recovery.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: เต็มใน [TASK-016](TASK-016-late-payment-recovery.md); Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-73 | [TASK-016](TASK-016-late-payment-recovery.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: เต็มใน [TASK-016](TASK-016-late-payment-recovery.md); Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-74 | [TASK-016](TASK-016-late-payment-recovery.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: เต็มใน [TASK-016](TASK-016-late-payment-recovery.md); Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-75 | [TASK-017](TASK-017-ticket-email-delivery.md), [TASK-018](TASK-018-guest-order-lookup.md) | ร่วมทั้งหมด: TASK-017 — ส่วนส่งไม่สำเร็จ/retry คง paid/QR; TASK-018 เติม lookup recovery; TASK-018 — ส่วน lookup recovery หลัง delivery failure ร่วม TASK-017 |
| AC-76 | [TASK-019](TASK-019-owner-contact-correction.md) | เต็มใน [TASK-019](TASK-019-owner-contact-correction.md) |
| AC-77 | [TASK-028](TASK-028-organizer-money-report.md) | เต็มใน [TASK-028](TASK-028-organizer-money-report.md) |
| AC-78 | [TASK-028](TASK-028-organizer-money-report.md) | เต็มใน [TASK-028](TASK-028-organizer-money-report.md) |
| AC-79 | [TASK-029](TASK-029-weekly-manual-payout.md) | เต็มใน [TASK-029](TASK-029-weekly-manual-payout.md) |
| AC-80 | [TASK-028](TASK-028-organizer-money-report.md) | เต็มใน [TASK-028](TASK-028-organizer-money-report.md) |
| AC-81 | [TASK-028](TASK-028-organizer-money-report.md) | เต็มใน [TASK-028](TASK-028-organizer-money-report.md) |
| AC-82 | [TASK-028](TASK-028-organizer-money-report.md) | เต็มใน [TASK-028](TASK-028-organizer-money-report.md) |
| AC-83 | [TASK-030](TASK-030-reserve-release.md) | เต็มใน [TASK-030](TASK-030-reserve-release.md) |
| AC-84 | [TASK-027](TASK-027-cancel-pending-payments.md), [TASK-028](TASK-028-organizer-money-report.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: ร่วมทั้งหมด: TASK-027 — pending-cancel cases คง paid-but-not-issued/review และไม่เครดิต V_o; TASK-028 ตรวจ report/entitlement; TASK-028 — report basis/withheld unissued funds และไม่หัก refund ซ้ำ; TASK-027 สร้าง pending-cancel financial states จริง; Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-85 | [TASK-031](TASK-031-event-debt-repayment.md) | เต็มใน [TASK-031](TASK-031-event-debt-repayment.md) |
| AC-86 | [TASK-031](TASK-031-event-debt-repayment.md) | เต็มใน [TASK-031](TASK-031-event-debt-repayment.md) |
| AC-87 | [TASK-029](TASK-029-weekly-manual-payout.md) | เต็มใน [TASK-029](TASK-029-weekly-manual-payout.md) |
| AC-88 | [TASK-022](TASK-022-refund-approval.md) | เต็มใน [TASK-022](TASK-022-refund-approval.md) |
| AC-89 | [TASK-022](TASK-022-refund-approval.md) | เต็มใน [TASK-022](TASK-022-refund-approval.md) |
| AC-90 | [TASK-022](TASK-022-refund-approval.md) | เต็มใน [TASK-022](TASK-022-refund-approval.md) |
| AC-91 | [TASK-026](TASK-026-cancel-issued-session.md) | เต็มใน [TASK-026](TASK-026-cancel-issued-session.md) |
| AC-92 | [TASK-023](TASK-023-manual-refund-proof.md), [TASK-029](TASK-029-weekly-manual-payout.md) | ร่วมทั้งหมด: TASK-023 — สิทธิ์ไฟล์หลักฐาน refund; TASK-029 เติม payout proof; TASK-029 — สิทธิ์ไฟล์หลักฐาน payout ร่วม TASK-023 |
| AC-93 | [TASK-023](TASK-023-manual-refund-proof.md), [TASK-029](TASK-029-weekly-manual-payout.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: ร่วมทั้งหมด: TASK-023 — manual refund failure/retry/liability; TASK-029 เติม payout failure; TASK-029 — manual payout failure/retry ร่วม TASK-023; Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-94 | [TASK-032](TASK-032-offline-primary-dataset.md) | เต็มใน [TASK-032](TASK-032-offline-primary-dataset.md) |
| AC-95 | [TASK-020](TASK-020-online-admission.md) | เต็มใน [TASK-020](TASK-020-online-admission.md) |
| AC-96 | [TASK-033](TASK-033-offline-admission.md) | เต็มใน [TASK-033](TASK-033-offline-admission.md) |
| AC-97 | [TASK-035](TASK-035-primary-handover-recovery.md) | เต็มใน [TASK-035](TASK-035-primary-handover-recovery.md) |
| AC-98 | [TASK-035](TASK-035-primary-handover-recovery.md) | เต็มใน [TASK-035](TASK-035-primary-handover-recovery.md) |
| AC-99 | [TASK-034](TASK-034-offline-sync-conflicts.md) | เต็มใน [TASK-034](TASK-034-offline-sync-conflicts.md) |
| AC-100 | [TASK-020](TASK-020-online-admission.md) | เต็มใน [TASK-020](TASK-020-online-admission.md) |
| AC-101 | [TASK-020](TASK-020-online-admission.md) | เต็มใน [TASK-020](TASK-020-online-admission.md) |
| AC-102 | [TASK-034](TASK-034-offline-sync-conflicts.md) | เต็มใน [TASK-034](TASK-034-offline-sync-conflicts.md) |
| AC-103 | [TASK-033](TASK-033-offline-admission.md) | เต็มใน [TASK-033](TASK-033-offline-admission.md) |
| AC-104 | [TASK-036](TASK-036-responsive-role-interfaces.md) | เต็มใน [TASK-036](TASK-036-responsive-role-interfaces.md) |
| AC-105 | [TASK-001](TASK-001-local-foundation.md), [TASK-037](TASK-037-shared-instance-contract.md) | ร่วมทั้งหมด: TASK-001 — วาง shared persistence/transaction และ test boundary; TASK-037 ตรวจพฤติกรรมหลาย web instances ให้ครบ; TASK-037 — ปิด shared-instance behavior ทั้งชุดต่อจาก prerequisite ใน TASK-001 |
| AC-106 | [TASK-012](TASK-012-reserve-tickets.md) | เต็มใน [TASK-012](TASK-012-reserve-tickets.md) |
| AC-107 | [TASK-022](TASK-022-refund-approval.md) | เต็มใน [TASK-022](TASK-022-refund-approval.md) |
| AC-108 | [TASK-025](TASK-025-reschedule-refund-window.md), [TASK-026](TASK-026-cancel-issued-session.md) | ร่วมทั้งหมด: TASK-025 — ส่วน request/approval ของ reschedule; TASK-026 เติม cancellation approval; TASK-026 — ส่วน request/approval ของ cancellation ร่วม TASK-025 |
| AC-109 | [TASK-024](TASK-024-approved-live-edits.md) | เต็มใน [TASK-024](TASK-024-approved-live-edits.md) |
| AC-110 | [TASK-028](TASK-028-organizer-money-report.md) | เต็มใน [TASK-028](TASK-028-organizer-money-report.md) |
| AC-111 | [TASK-012](TASK-012-reserve-tickets.md) | เต็มใน [TASK-012](TASK-012-reserve-tickets.md) |
| AC-112 | [TASK-027](TASK-027-cancel-pending-payments.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: เต็มใน [TASK-027](TASK-027-cancel-pending-payments.md); Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-113 | [TASK-027](TASK-027-cancel-pending-payments.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: เต็มใน [TASK-027](TASK-027-cancel-pending-payments.md); Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-114 | [TASK-027](TASK-027-cancel-pending-payments.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ประวัติเดิม: เต็มใน [TASK-027](TASK-027-cancel-pending-payments.md); Stripe follow-up: [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) ตรวจขอบเขตตาม Todo ใหม่ ผลเดิมไม่ปิดส่วน Stripe |
| AC-115 | [TASK-039](TASK-039-owner-overview-counts.md) | เต็มใน [TASK-039](TASK-039-owner-overview-counts.md) |
| AC-116 | [TASK-038](TASK-038-owner-workspace-navigation.md) | เต็มใน [TASK-038](TASK-038-owner-workspace-navigation.md) |
| AC-117 | [TASK-040](TASK-040-multi-step-purchase-journey.md) | เต็มใน [TASK-040](TASK-040-multi-step-purchase-journey.md) |

| AC-118 | [TASK-042](TASK-042-stripe-promptpay-qr.md) | เต็มใน TASK-042 |
| AC-119 | [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) | เต็มใน TASK-043 |
| AC-120 | [TASK-042](TASK-042-stripe-promptpay-qr.md), [TASK-043](TASK-043-stripe-verified-ticket-issuance.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ร่วมทั้งหมด: TASK-042 create/confirm/timeout/retry; TASK-043 event/paid/issue; TASK-044 recovery/refund-case deduplication |
| AC-121 | [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | เต็มใน TASK-044 รวม provider cancel failure/success race และ saved QR |
| AC-122 | [TASK-043](TASK-043-stripe-verified-ticket-issuance.md), [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md) | ร่วมทั้งหมด: TASK-043 timely/unknown-time guard; TASK-044 resolved-time recovery หลัง release/cancel; TASK-041 เป็น prerequisite evidence ไม่ใช่ AC delivery |
| AC-123 | [TASK-042](TASK-042-stripe-promptpay-qr.md), [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) | ร่วมทั้งหมด: TASK-042 config/create mode isolation; TASK-043 webhook/paid/issue และ test-payment endpoint ไม่สามารถสร้างเงินจริงใน live mode |

## Dependency order and parallel work

ตาราง wave เดิมเป็นประวัติ TASK-001–040 ที่ done แล้ว ไม่ใช่ลำดับงานใหม่; แผน Stripe อยู่ถัดจากตาราง
ตารางนี้แสดง wave ที่ทำได้เมื่อ upstream ครบ ไม่ใช่การเริ่ม agent หรือ implementation อัตโนมัติ
รันคู่ขนานได้เมื่อไม่ชนการแก้ไฟล์/พื้นที่เดียวกันและประสาน shared contract; แต่ละ task ยังต้องผ่าน policy ของตน

| Wave | Tasks ที่ไม่มี dependency ค้างหลัง wave ก่อนหน้า |
| --- | --- |
| 1 | [TASK-001](TASK-001-local-foundation.md) |
| 2 | [TASK-002](TASK-002-owner-login.md) |
| 3 | [TASK-003](TASK-003-password-reset.md), [TASK-008](TASK-008-public-news.md) |
| 4 | [TASK-004](TASK-004-organizer-invitations.md) |
| 5 | [TASK-005](TASK-005-event-drafts.md) |
| 6 | [TASK-006](TASK-006-session-approval.md), [TASK-009](TASK-009-scanner-accounts.md), [TASK-010](TASK-010-event-fee-settings.md) |
| 7 | [TASK-007](TASK-007-public-concert-catalog.md) |
| 8 | [TASK-011](TASK-011-guest-email-verification.md) |
| 9 | [TASK-012](TASK-012-reserve-tickets.md) |
| 10 | [TASK-013](TASK-013-reservation-expiry.md) |
| 11 | [TASK-014](TASK-014-payment-qr.md) |
| 12 | [TASK-015](TASK-015-paid-ticket-issuance.md) |
| 13 | [TASK-016](TASK-016-late-payment-recovery.md), [TASK-017](TASK-017-ticket-email-delivery.md), [TASK-020](TASK-020-online-admission.md), [TASK-024](TASK-024-approved-live-edits.md) |
| 14 | [TASK-018](TASK-018-guest-order-lookup.md), [TASK-032](TASK-032-offline-primary-dataset.md) |
| 15 | [TASK-019](TASK-019-owner-contact-correction.md), [TASK-021](TASK-021-refund-requests.md), [TASK-033](TASK-033-offline-admission.md) |
| 16 | [TASK-022](TASK-022-refund-approval.md), [TASK-025](TASK-025-reschedule-refund-window.md) |
| 17 | [TASK-023](TASK-023-manual-refund-proof.md), [TASK-026](TASK-026-cancel-issued-session.md), [TASK-034](TASK-034-offline-sync-conflicts.md) |
| 18 | [TASK-027](TASK-027-cancel-pending-payments.md), [TASK-028](TASK-028-organizer-money-report.md), [TASK-035](TASK-035-primary-handover-recovery.md) |
| 19 | [TASK-029](TASK-029-weekly-manual-payout.md), [TASK-030](TASK-030-reserve-release.md) |
| 20 | [TASK-031](TASK-031-event-debt-repayment.md) |
| 21 | [TASK-036](TASK-036-responsive-role-interfaces.md) |
| 22 | [TASK-037](TASK-037-shared-instance-contract.md), [TASK-038](TASK-038-owner-workspace-navigation.md) |
| 23 | [TASK-039](TASK-039-owner-overview-counts.md) |
| 24 | [TASK-040](TASK-040-multi-step-purchase-journey.md) |

### Stripe dependency order

[TASK-041](TASK-041-stripe-promptpay-contract.md) → [TASK-042](TASK-042-stripe-promptpay-qr.md) → [TASK-043](TASK-043-stripe-verified-ticket-issuance.md) → [TASK-044](TASK-044-stripe-expiry-cancellation-recovery.md)

เป็น dependency จริง: contract evidence → intent ที่ผูก order → verified payment ingress → late/cancel recovery
ไม่มีงาน Stripe คู่ขนานก่อน contract พร้อม; ไม่สร้าง parallel handoff ระหว่าง tasks ที่แก้ payment boundary เดียวกัน
งาน done เดิมเป็นบริบทการ reuse ไม่ต้องทำใหม่เพื่อปลด task แรก

## First runnable task

[TASK-041](TASK-041-stripe-promptpay-contract.md) ไม่มี upstream หรือ user-action blocker ที่ยืนยันว่าขวางการเริ่มอ่าน official contract
ขั้นถัดไปคือ `$implement-task` เฉพาะ TASK-041; ยังไม่มีงานถูกเริ่ม in_progress จากการวางแผน
หากจำเป็นต้องใช้ test account/access แล้วไม่พร้อม ให้ระบุ external blocker จริงและวิธีปลดใน task นั้น;
Live/PromptPay approval ไม่บล็อกการเริ่ม research/local แต่ยังเป็น production gate ตาม NQ-05

## Local-first and deferred production work

TASK-001–TASK-044 พัฒนา/ตรวจบน local (TASK-041 เป็น contract spike); TASK-037 อยู่เพื่อทวน functional state ด้วยหลาย local web processes ไม่ใช่ load benchmark
Production reconciliation 2026-10-30: baseline ขนาด/topology/scaling/backup/retention ยืนยันแล้วใน [ADR-0002](../adr/0002-local-first-and-aws-production.md); คง ECS Fargate ARM64 + ALB และ private RDS ไม่เลือก App Runner
ยังไม่สร้างงาน provision/deploy AWS หรือ capacity test เพราะงบ cloud/estimate จริง, workload/latency/error/duration targets, rollout connection budget และ recovery details ใน NQ-04 ยังเปิด; ไม่อ้างว่าผล local รองรับ 200 คน
TASK-037 และงาน done เดิมคงสถานะ/หลักฐานเดิม ไม่ถูก reopen หรือถือว่าครอบคลุม ARM64/cloud/scaling จากการปรับเอกสารนี้
Merchant/PromptPay approval, verified email domain, production R2 และ verified success-time mapping เป็นเงื่อนไขตาม NQ-05; local doubles ไม่ใช่หลักฐานพร้อม production
เป้าหมาย 200 simultaneous users ยังไม่ใช่ผลทดสอบและไม่เดา RPS/latency/duration แทนผู้ใช้

## Open settings and blocker ownership

| รายการจาก spec | เจ้าของในแผน / เงื่อนไข |
| --- | --- |
| NQ-01 event rates/limits/windows/weekly weekday จริง | TASK-005/010/025/029 รับ configuration และ fixture; ค่าจริงต้องพร้อมก่อนเปิดงานจริง ไม่บล็อก local ด้วย fixture |
| NQ-02 tokens/icon set/browser baseline | ใช้ constraints เดิมทุก UI task; TASK-001 วาง shell และ TASK-036 ทวนทุกหน้าจริง ไม่เปิด design discovery ซ้ำ |
| NQ-03 runtime/PM/ORM/auth/runners/commands | TASK-001 สร้าง toolchain/runners/คำสั่งจริง TASK-002 เลือก auth/bootstrap ภายใน ADR; ทุก task ตรวจ command ใหม่ก่อนรัน |
| NQ-04 AWS production readiness | Baseline ยืนยันใน ADR-0002 ฉบับ 2026-10-30 แล้ว; ส่วนงบ/estimate/โหลด/rollout/recovery ที่ยังเปิดอยู่นอกงาน local ต้องปิดก่อนสร้างงาน production/deployment/scaling จริง |
| NQ-05 provider integration/readiness | Stripe follow-up: TASK-041 เป็นเจ้าของ paid-time/QR/cancel contract proof; TASK-042/043/044 ส่งมอบ boundary ที่ตรวจแล้ว ถ้าพิสูจน์ไม่ได้ต้องบล็อกพร้อมเหตุ ไม่ reopen TASK-014 done; Live approval ยังไม่ยืนยันและไม่ใช้ test pass แทน ส่วน email/R2 อ้างงานเดิม |
| NQ-06 internal session/retry/local retention/operational steps | TASK-011/018/019/032–035 เลือก/บันทึกภายในขอบเขตสเปก หากต้องเปลี่ยน product/สิทธิ์/ยอดเงินให้กลับ workflow ที่เป็นเจ้าของ |

ไม่มี user-action blocker ที่ยืนยันว่าขวางการเริ่ม research ใน TASK-041 ขณะวางแผน; dependencies ของ task อื่นอยู่ใน Blocked by ของแต่ละไฟล์
NQ ที่มีผลภายหลังไม่ถูกซ่อนหรือถือว่ายืนยันแล้ว และ task ที่พบเงื่อนไขบล็อกจริงต้องบันทึกเหตุ/เงื่อนไขปลดบล็อกใน Blocked by ตาม workflow

## Planning verification

ตรวจ coverage/ID/DAG/relative links/format/checklist ก่อนส่งแผน; ผลนี้เป็นการตรวจเอกสาร ไม่ใช่ unit/integration/E2E/code-review ของแอป
ไม่มี application code/configuration/test runner ถูกสร้างจาก to-tasks และไม่มีการ provision/deploy/ส่งอีเมลหรือโอนเงินจริง
เมื่อเรียก to-tasks ซ้ำให้ตรวจ source spec กับ task set นี้ก่อน รักษา IDs/evidence/งานที่เสร็จแล้ว และสร้างเฉพาะงานที่ยังขาด ไม่สร้างชุดซ้ำ
