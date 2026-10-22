import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
  addScannerToEvent,
} from '../../src/server/events';
import {
  setEventPrimaryScanner,
  getEventPrimaryScanner,
  getOfflineDataset,
  checkHandoverReadiness,
  handoverEventPrimaryScanner,
  emergencyStopOffline,
  resumeOfflineAdmissionAfterReconciliation,
  getEventOfflineControl,
} from '../../src/server/primary-scanner';
import { setCustomEmailTransport } from '../../src/server/email';

describe('TASK-035: Primary Handover & Emergency Recovery Integration Tests (AC-97, AC-98)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  let eventId: string;
  let sessionId: string;
  let scanner1Id: string;
  let scanner2Id: string;
  let scanner3Id: string;

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);

    const org = fixture.ids.organizer;
    const now = Date.now();
    const sessionStartTime = new Date(now - 1 * 3600 * 1000).toISOString();
    const sessionEndTime = new Date(now + 4 * 3600 * 1000).toISOString();

    // 1. Create Event & Session
    const draft = await createEventDraft(
      fixture.pool,
      org,
      {
        title: 'คอนเสิร์ต สลับเครื่องหลักและกู้คืนฉุกเฉิน',
        location: 'อิมแพ็ค ชาเลนเจอร์ ฮอลล์ 3',
      },
      [
        {
          startTime: sessionStartTime,
          endTime: sessionEndTime,
          ticketTypes: [{ name: 'Regular Zone', price: 1000, quota: 50 }],
        },
      ],
    );

    eventId = draft.id;
    sessionId = draft.sessions[0].id;
    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // 2. Add Scanner 1, Scanner 2, and Scanner 3
    const sc1 = await addScannerToEvent(fixture.pool, org, eventId, {
      name: 'ทีมสแกน 1 (เครื่องเดิม)',
      email: `handover-sc1-${Date.now()}@ticket.invalid`,
    });
    scanner1Id = sc1.scannerId;

    const sc2 = await addScannerToEvent(fixture.pool, org, eventId, {
      name: 'ทีมสแกน 2 (เครื่องใหม่)',
      email: `handover-sc2-${Date.now()}@ticket.invalid`,
    });
    scanner2Id = sc2.scannerId;

    const sc3 = await addScannerToEvent(fixture.pool, org, eventId, {
      name: 'ทีมสแกน 3 (เครื่องสำรอง)',
      email: `handover-sc3-${Date.now()}@ticket.invalid`,
    });
    scanner3Id = sc3.scannerId;

    // Set Scanner 1 as initial primary
    await setEventPrimaryScanner(
      fixture.pool,
      { id: org, role: 'organizer' },
      eventId,
      scanner1Id,
    );
  }, 40000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  it('1. Rejects handover when old primary has pending scans or new scanner has not synced dataset (AC-97)', async () => {
    const org = fixture.ids.organizer;

    // Condition A: Scanner 2 has NOT downloaded dataset yet -> readiness check fails
    const readinessNotSynced = await checkHandoverReadiness(fixture.pool, eventId, scanner2Id, 0);
    expect(readinessNotSynced.ready).toBe(false);
    expect(readinessNotSynced.isNewScannerSynced).toBe(false);
    expect(readinessNotSynced.reasons.some(r => r.includes('ยังไม่ได้ดาวน์โหลดชุดข้อมูลล่าสุด'))).toBe(true);

    // Attempting handover must throw
    await expect(
      handoverEventPrimaryScanner(
        fixture.pool,
        { id: org, role: 'organizer' },
        eventId,
        scanner2Id,
        { oldScannerPendingCount: 0 },
      ),
    ).rejects.toThrow(/ยังไม่ได้ดาวน์โหลดชุดข้อมูลล่าสุด/);

    // Condition B: Scanner 2 downloads dataset, but old primary still has pending scans (old pending > 0)
    await getOfflineDataset(fixture.pool, { id: scanner2Id, role: 'scanner' }, eventId);

    const readinessWithPending = await checkHandoverReadiness(fixture.pool, eventId, scanner2Id, 3);
    expect(readinessWithPending.ready).toBe(false);
    expect(readinessWithPending.oldPendingCount).toBe(3);
    expect(readinessWithPending.reasons.some(r => r.includes('ยังมีรายการสแกนค้าง'))).toBe(true);

    await expect(
      handoverEventPrimaryScanner(
        fixture.pool,
        { id: org, role: 'organizer' },
        eventId,
        scanner2Id,
        { oldScannerPendingCount: 3 },
      ),
    ).rejects.toThrow(/ยังมีรายการสแกนค้างที่ยังไม่ซิงก์กลับส่วนกลาง/);

    // Current primary must strictly remain Scanner 1
    const current = await getEventPrimaryScanner(fixture.pool, eventId);
    expect(current?.scannerId).toBe(scanner1Id);
  });

  it('2. Successfully handovers primary device atomically when old pending is 0 and new dataset is synced (AC-97)', async () => {
    const org = fixture.ids.organizer;

    // Both conditions met: old pending = 0 and scanner 2 already synced dataset
    const readiness = await checkHandoverReadiness(fixture.pool, eventId, scanner2Id, 0);
    expect(readiness.ready).toBe(true);
    expect(readiness.canHandover).toBe(true);

    const handoverResult = await handoverEventPrimaryScanner(
      fixture.pool,
      { id: org, role: 'organizer', name: 'ผู้จัดงานคอนเสิร์ต' },
      eventId,
      scanner2Id,
      { oldScannerPendingCount: 0, reason: 'เปลี่ยนกะการทำงานตามปกติ' },
    );

    expect(handoverResult.success).toBe(true);
    expect(handoverResult.primaryScanner.scannerId).toBe(scanner2Id);
    expect(handoverResult.handover.oldScannerId).toBe(scanner1Id);
    expect(handoverResult.handover.newScannerId).toBe(scanner2Id);
    expect(handoverResult.handover.action).toBe('HANDOVER');

    // Verify DB: exactly ONE primary scanner exists for event (Scanner 2)
    const current = await getEventPrimaryScanner(fixture.pool, eventId);
    expect(current?.scannerId).toBe(scanner2Id);

    const countRes = await fixture.pool.query('SELECT COUNT(*) FROM event_primary_scanners WHERE "eventId" = $1', [eventId]);
    expect(Number(countRes.rows[0].count)).toBe(1);

    // Handover history recorded
    const history = await getEventOfflineControl(fixture.pool, eventId);
    expect(history.handovers.length).toBeGreaterThanOrEqual(1);
    expect(history.handovers[0].newScannerId).toBe(scanner2Id);
  });

  it('3. Emergency Stop Offline: halts offline scanning when device is damaged/lost, blocks handover, and resumes after reconciliation (AC-98, NQ-06)', async () => {
    const org = fixture.ids.organizer;

    // Scanner 2 is primary. Primary device is damaged with 5 unsynced scans lost.
    // Organizer triggers emergency stop for reconciliation (NQ-06)
    const stopResult = await emergencyStopOffline(
      fixture.pool,
      { id: org, role: 'organizer', name: 'ผู้จัดงานคอนเสิร์ต' },
      eventId,
      {
        reason: 'DEVICE_DAMAGED_RECONCILIATION_REQUIRED',
        details: 'หน้าจอเครื่องแตกและแบตเตอรี่ระเบิด มีรายการสแกนค้างประมาณ 5 รายการ',
        lostPendingCount: 5,
      },
    );

    expect(stopResult.offlineStatus).toBe('halted_reconciliation_required');
    expect(stopResult.haltReason).toBe('DEVICE_DAMAGED_RECONCILIATION_REQUIRED');

    // Primary designation is removed to prevent unauthorized offline operation
    const currentPrimaryAfterHalt = await getEventPrimaryScanner(fixture.pool, eventId);
    expect(currentPrimaryAfterHalt).toBeNull();

    // While halted, scanner dataset fetch indicates offline is halted
    const ds = await getOfflineDataset(fixture.pool, { id: scanner3Id, role: 'scanner' }, eventId);
    expect(ds.isOfflineHalted).toBe(true);
    expect(ds.offlineStatus).toBe('halted_reconciliation_required');

    // Attempting handover while halted is strictly blocked (AC-98)
    await expect(
      handoverEventPrimaryScanner(
        fixture.pool,
        { id: org, role: 'organizer' },
        eventId,
        scanner3Id,
        { oldScannerPendingCount: 0 },
      ),
    ).rejects.toThrow(/การใช้งานออฟไลน์ถูกระงับเพื่อกระทบยอด/);

    // Organizer and Owner complete reconciliation and resume offline admission (AC-98, NQ-06)
    const resumeResult = await resumeOfflineAdmissionAfterReconciliation(
      fixture.pool,
      { id: fixture.ids.owner, role: 'owner', name: 'เจ้าของเว็บ' },
      eventId,
      { notes: 'ตรวจสอบผู้ชมจริงและประวัติการสแกนในระบบกลางเรียบร้อย ยืนยันปลดระงับ' },
    );

    expect(resumeResult.offlineStatus).toBe('active');
    expect(resumeResult.resumedBy).toBe('เจ้าของเว็บ');

    // After resumption, organizer can designate a new primary scanner (e.g. Scanner 3)
    await setEventPrimaryScanner(
      fixture.pool,
      { id: org, role: 'organizer' },
      eventId,
      scanner3Id,
    );

    const finalPrimary = await getEventPrimaryScanner(fixture.pool, eventId);
    expect(finalPrimary?.scannerId).toBe(scanner3Id);
  });
});
