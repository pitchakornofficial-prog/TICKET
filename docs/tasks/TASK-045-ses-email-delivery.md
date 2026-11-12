# TASK-045: ส่งอีเมลธุรกรรมผ่าน Amazon SES ได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

OTP, บัตรและลิงก์ order, คำเชิญ และ reset ใช้ SES โดยรักษา local capture, สิทธิ์และ recovery เดิมตาม [requirement](../requirement.md#email-provider-change-2026-11-11), [ADR-0003](../adr/0003-external-integrations.md#email-provider-change--2026-11-11), [policy](../../CONTEXT.md#verification-policy) และ [coverage](README.md#ses-follow-up-2026-11-11). TASK-003/004/011/017/018 เป็นหลักฐานประวัติ ไม่รับรอง SES.

## Blocked by

- None

## Todo

- [x] ส่งมอบ AC-126/127 และ re-verify ส่วนอีเมลของ AC-20, AC-52, AC-55, AC-57, AC-58 และ AC-75 กับ SES; คง OTP rate limit, สิทธิ์, ticket และ recovery เดิม.
- [x] เปลี่ยน transport ร่วมจาก Resend เป็น SES รวม configuration และคู่มือ local/production ที่เกี่ยวข้อง; คง capture/test double แบบ local และห้าม production fallback เป็น capture; ไม่เปิดเผย credentials หรืออ้าง provider acceptance ว่าถึง inbox.
- [x] ครอบคลุม AC-128 ด้วย readiness instructions สำหรับ identity, production access, Region, peak quota และ bounce/complaint; บันทึกว่า production readiness ต้องมีหลักฐานจริงก่อนเปิดใช้ ไม่ provision หรือส่งจริงโดยอัตโนมัติ.
- [x] Verification — unit/integration กับ SES contract double: payload/ผู้รับของ OTP, ticket/order link, invitation, reset; config ขาด, provider rejection/timeout, local capture และ production guard; failure ไม่ย้อน paid/issued และ recovery คงเดิม.
- [x] Verification — E2E critical journeys ที่เกี่ยวข้องกับ OTP และ ticket delivery/recovery ผ่าน local double; ตรวจ typecheck, lint, build และ runner ตาม policy; ผล double ไม่รับรอง SES production.
- [x] Review changes requested — P2 at tests/e2e/ticket-email-delivery.spec.ts:14; unused parameter 'request' fails npm run lint (biome --error-on-warnings); resolved by removing unused parameter; verified npm run lint (491 files checked, 0 errors/warnings) and npm run typecheck passed.
- [x] Review approved — working tree against HEAD; AC-126, AC-127, AC-128 verified; email portions of AC-20, AC-52, AC-55, AC-57, AC-58, AC-75 verified; typecheck, lint, build, unit-test (846/846 passed), integration-test (ticket-email-delivery passed on ticket_test), and e2e-test (16/16 passed) verified; no findings.
- [ ] หากผู้ใช้หรือนโยบายกำหนด commit ให้ commit เฉพาะ task นี้ มิฉะนั้นเตรียม focused diff; ไม่ init Git/commit/push อัตโนมัติ.
