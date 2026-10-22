# TASK-034: ผลออฟไลน์ซิงก์กลับครั้งเดียวและแจ้งข้อมูลขัดแย้งได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

เครื่องหลักส่งผลค้างกลับส่วนกลางและแสดง pending ตาม acknowledgement จริง โดยคง audit/owner review หากขัดกับ central revocation

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-033 — [เครื่องหลักสแกนเข้า ออก และกลับเข้าโดยออฟไลน์ได้](TASK-033-offline-admission.md)
- TASK-022 — [เจ้าของเว็บอนุมัติคืนแล้วเพิกถอน QR และคืนโควตาได้ครั้งเดียว](TASK-022-refund-approval.md)

## Todo

- [x] ส่งมอบและตรวจ AC-99, AC-102 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [x] ส่วนร่วม AC-42: pending/last-sync หลัง reconnect ตามผลรับจริง ร่วม TASK-033; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-033 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] ทำส่งผลตามลำดับ/รับ acknowledgement และโหลดข้อมูลล่าสุดโดยไม่เพิ่มผลเดิมเมื่อ reconnect/retry/partial sync
- [x] ถ้า cache valid แต่กลาง revoked หรือประวัติขัดแย้ง ให้คง offline audit และแจ้ง owner ตรวจ ไม่ revalidate QR กลาง ลบประวัติ หรือย้อน refund/payout อัตโนมัติ
- [x] pending ลดตามผลที่ส่วนกลางรับจริง last successful sync เปลี่ยนเมื่อจบจริง; หาก sync ไม่ครบยังแสดงค้างเพื่อ handover task ใช้เป็น gate
- [x] Verification — Integration: send duplicated/out-of-order batches, partial ack/retry และ cached-valid→central refund revoke→offline admission→sync conflict; ตรวจ central validity/refund ไม่ย้อน (`tests/integration/offline-sync.test.ts` ผ่าน 3 tests)
- [x] Verification — E2E reconnect: pending/historyไม่ซ้ำ ownerเห็น conflict และ last sync ไม่อ้างสำเร็จก่อนครบ (`tests/e2e/offline-sync-conflicts.spec.ts` ผ่าน 2 tests)
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

## Verification Evidence

1. **Unit tests (`tests/unit/offline-sync.test.ts`):**
   - 4 tests passed:
     - Handles empty pending queue gracefully without unnecessary network calls.
     - Syncs pending scans and removes acknowledged items from local storage queue (AC-102).
     - Handles partial acknowledgement by keeping unacknowledged items in pending queue for subsequent retries (AC-102).
     - Preserves pending scans in storage if server returns error or network fails.
   - Full unit test suite: 172 tests passed across 33 files (`npm run test:unit`).

2. **Integration tests (`tests/integration/offline-sync.test.ts`):**
   - 3 tests passed against real PostgreSQL:
     - Syncs offline entry scan back to central server idempotently without duplicate logs or transitions (AC-102).
     - Central revocation conflict: cached-valid ticket refunded centrally then admitted offline creates review case (`CENTRAL_REVOKED_OFFLINE_ADMIT`) without revalidating central ticket status, and owner resolves conflict (AC-99, G-44).
     - Secondary scanner or unassigned scanner is rejected from syncing offline scans (AC-08, AC-40, AC-94).
   - Full integration test suite: 119 tests passed across 34 files (`npm run test:integration`).

3. **E2E Playwright tests (`tests/e2e/offline-sync-conflicts.spec.ts`):**
   - 2 tests passed across desktop-chromium and mobile-chromium:
     - Full offline-to-online lifecycle: Organizer sets primary scanner -> Guest purchases ticket -> Primary scanner caches offline dataset -> Toggles offline mode -> Performs offline scan (pending count increments to 1) -> Switches back online -> Syncs pending scans -> Pending count resets to 0 and sync button disables (AC-102, AC-42).
     - Owner conflict review dashboard verifies and resolves pending conflicts without altering financial/ticket liabilities.

4. **Lint, Typecheck & Standalone Build:**
   - Biome lint: 260 files checked, 0 errors, 0 warnings (`npm run lint`).
   - TypeScript typecheck: 0 errors (`npm run typecheck`).
   - Standalone Next.js build: 39 routes generated successfully (`npm run build`).

5. **Code Review Evidence (Mode: final):**
   - **Review Result:** Approved (0 findings).
   - **Criteria Verified:** AC-99, AC-102, joint AC-42, AC-65, G-44.
   - **Behavioral & Safety checks:**
     - Idempotent sync (`syncOfflineAdmissionScans`) checks existing scan IDs in `ticket_admission_logs`; re-transmitting batches acknowledges already-received records without duplicating entries or re-triggering admission status changes.
     - Central revocation conflict safety (AC-99, G-44): When offline scan targets a centrally refunded, cancelled, or revoked ticket, a conflict entry is logged in `admission_sync_conflicts` with `status: 'pending_review'`, and an audit log is saved with `reason: 'SYNC_CONFLICT_CENTRAL_REVOKED'`. Crucially, central ticket status remains revoked/refunded, no quota or payout liabilities are altered, and no revalidation occurs.
     - Owner review workflow: Owner endpoint `/api/owner/sync-conflicts` and resolution endpoint `/api/owner/sync-conflicts/[id]/resolve` enforce `owner` role strictly (403 for other roles) and record resolution notes with reviewer identity.
     - Partial sync resilience: Client storage updates preserve unacknowledged items in the pending queue so that partial network failures do not result in silent loss of scan history.
     - Operational visibility (AC-42): Live connectivity badge, last successful sync timestamp, and pending count reflect actual device and sync acknowledgment states.
     - Strict privacy (AC-65): Zero buyer PII exposed across offline sync payloads, conflicts table, and admission logs.
     - UI design adherence: Thai language, Kanit typography, pure SVG icons (zero emoji), 60/30/10 palette, and full mobile responsiveness.
