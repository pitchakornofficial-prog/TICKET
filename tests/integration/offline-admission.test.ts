import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { authFixture } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
  addScannerToEvent,
} from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  setEventPrimaryScanner,
  getOfflineDataset,
} from '../../src/server/primary-scanner';
import {
  setCustomEmailTransport,
  clearCapturedEmails,
  getCapturedEmails,
} from '../../src/server/email';
import {
  performOfflineAdmissionScan,
  getOfflinePendingScans,
  getOfflineDatasetKey,
} from '../../src/lib/offline-admission';

function createMockStorage(initialData: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initialData));
  let failOnSetItem = false;

  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (failOnSetItem) {
        throw new Error('QuotaExceededError: storage full');
      }
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setFail(fail: boolean) {
      failOnSetItem = fail;
    },
    dump(): Record<string, string> {
      return Object.fromEntries(store.entries());
    },
  };
}

describe('TASK-033: Offline Admission Integration Tests (AC-40, AC-41, AC-50, AC-96, AC-103)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  let eventId: string;
  let sessionId: string;
  let ticketTypeId: string;
  let primaryScannerId: string;
  let secondaryScannerId: string;
  let issuedTicketCode: string;
  let issuedQrPayload: string;

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
        title: 'คอนเสิร์ต ออฟไลน์ แอดมิชชั่น อินทิเกรชัน',
        location: 'ฮอลล์ 1',
      },
      [
        {
          startTime: sessionStartTime,
          endTime: sessionEndTime,
          ticketTypes: [{ name: 'VIP Standing', price: 1500, quota: 50 }],
        },
      ],
    );

    eventId = draft.id;
    sessionId = draft.sessions[0].id;
    ticketTypeId = draft.sessions[0].ticketTypes[0].id;

    // Approve session
    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // 2. Add Scanner 1 & Scanner 2
    const sc1 = await addScannerToEvent(fixture.pool, org, eventId, {
      name: 'หัวหน้าสแกน 1',
      email: `pri-${Date.now()}@ticket.invalid`,
    });
    primaryScannerId = sc1.scannerId;

    const sc2 = await addScannerToEvent(fixture.pool, org, eventId, {
      name: 'สแกนสำรอง 2',
      email: `sec-${Date.now()}@ticket.invalid`,
    });
    secondaryScannerId = sc2.scannerId;

    // Designate primary scanner (AC-94)
    await setEventPrimaryScanner(
      fixture.pool,
      { id: org, role: 'organizer' },
      eventId,
      primaryScannerId,
    );

    // 3. Purchase Ticket
    const buyerEmail = `buyer-admission-${randomUUID().slice(0, 8)}@ticket.invalid`;
    clearCapturedEmails();
    const otpReq = await requestGuestOtp(fixture.pool, {
      buyer: { name: 'คุณทดสอบ ออฟไลน์', email: buyerEmail, phone: '0812345678' },
      purpose: 'checkout',
      now: new Date(),
    });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';

    const otpVerify = await verifyGuestOtp(fixture.pool, {
      requestId: otpReq.requestId ?? '',
      code,
      email: buyerEmail,
      buyer: { name: 'คุณทดสอบ ออฟไลน์', email: buyerEmail, phone: '0812345678' },
      purpose: 'checkout',
      now: new Date(),
    });

    const resv = await createReservation(fixture.pool, {
      eventId,
      sessionId,
      verifiedToken: otpVerify.verifiedToken ?? '',
      items: [{ ticketTypeId, quantity: 1 }],
    });

    const charge = await createPaymentQr(fixture.pool, {
      orderId: resv.id,
      verifiedToken: otpVerify.verifiedToken ?? '',
    });

    const payment = await verifyAndProcessPayment(fixture.pool, {
      chargeId: charge.id,
      providerPaidAt: new Date(),
    });

    issuedTicketCode = payment.tickets?.[0]?.ticketCode || '';
    issuedQrPayload = payment.tickets?.[0]?.qrPayload || '';
    expect(issuedTicketCode).not.toBe('');
  }, 40000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  it('1. Primary scanner fetches offline dataset from DB and performs full entry/exit/reentry sequence offline (AC-96, AC-50)', async () => {
    // Fetch offline dataset for event
    const dataset = await getOfflineDataset(fixture.pool, { id: primaryScannerId, role: 'scanner' }, eventId);
    expect(dataset.isCurrentScannerPrimary).toBe(true);
    expect(dataset.tickets.length).toBeGreaterThanOrEqual(1);

    // Seed mock local storage with the downloaded dataset
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(dataset),
    });

    // Step A: First Entry offline
    const entry1 = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: issuedQrPayload,
        action: 'entry',
      },
      storage,
    );

    expect(entry1.success).toBe(true);
    expect(entry1.status).toBe('success');
    expect(entry1.ticket?.admissionStatus).toBe('inside');
    expect(entry1.pendingCount).toBe(1);

    // Verify localStorage has 1 pending item
    const pending1 = getOfflinePendingScans(eventId, storage);
    expect(pending1.length).toBe(1);
    expect(pending1[0].ticketCode).toBe(issuedTicketCode);
    expect(pending1[0].action).toBe('entry');
    expect(pending1[0].deviceMode).toBe('offline');

    // Step B: Repeat entry rejected (AC-49, AC-96)
    const repeatEntry = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: issuedTicketCode,
        action: 'entry',
      },
      storage,
    );

    expect(repeatEntry.success).toBe(false);
    expect(repeatEntry.status).toBe('rejected');
    expect(repeatEntry.reason).toBe('ALREADY_INSIDE');
    expect(repeatEntry.message).toContain('บัตรอยู่ในพื้นที่จัดงานแล้ว');
    expect(getOfflinePendingScans(eventId, storage).length).toBe(1);

    // Step C: Exit scan (AC-96)
    const exit1 = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: issuedQrPayload,
        action: 'exit',
      },
      storage,
    );

    expect(exit1.success).toBe(true);
    expect(exit1.status).toBe('success');
    expect(exit1.ticket?.admissionStatus).toBe('outside');
    expect(exit1.pendingCount).toBe(2);

    // Step D: Repeat exit rejected (AC-96)
    const repeatExit = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: issuedTicketCode,
        action: 'exit',
      },
      storage,
    );

    expect(repeatExit.success).toBe(false);
    expect(repeatExit.status).toBe('rejected');
    expect(repeatExit.reason).toBe('NOT_INSIDE');
    expect(repeatExit.message).toContain('บัตรอยู่นอกพื้นที่จัดงาน');
    expect(getOfflinePendingScans(eventId, storage).length).toBe(2);

    // Step E: Reentry scan (AC-96)
    const reentry = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: issuedTicketCode,
        action: 'entry',
      },
      storage,
    );

    expect(reentry.success).toBe(true);
    expect(reentry.status).toBe('success');
    expect(reentry.ticket?.admissionStatus).toBe('inside');
    expect(reentry.pendingCount).toBe(3);

    // Step F: Reload resilience check (AC-103)
    // Create new reader from same storage data
    const dumped = storage.dump();
    const reloadedStorage = createMockStorage(dumped);

    const reloadedPending = getOfflinePendingScans(eventId, reloadedStorage);
    expect(reloadedPending.length).toBe(3);

    // Try repeat scan after reload -> should still know it's inside!
    const reloadRepeatEntry = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: issuedTicketCode,
        action: 'entry',
      },
      reloadedStorage,
    );
    expect(reloadRepeatEntry.success).toBe(false);
    expect(reloadRepeatEntry.reason).toBe('ALREADY_INSIDE');
  });

  it('2. Missing or newly bought ticket not in offline snapshot returns wait for online (AC-41, O2)', async () => {
    const dataset = await getOfflineDataset(fixture.pool, { id: primaryScannerId, role: 'scanner' }, eventId);
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(dataset),
    });

    const unknownScan = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-NEWLY-BOUGHT-NOT-IN-SNAPSHOT',
        action: 'entry',
      },
      storage,
    );

    expect(unknownScan.success).toBe(false);
    expect(unknownScan.status).toBe('rejected');
    expect(unknownScan.reason).toBe('OFFLINE_TICKET_NOT_FOUND');
    expect(unknownScan.message).toBe('ไม่พบข้อมูลบัตรในชุดข้อมูลออฟไลน์ กรุณารอเชื่อมต่อออนไลน์ (AC-41, O2)');
  });

  it('3. Secondary scanner is rejected from offline scan (AC-40, O1)', async () => {
    const dataset = await getOfflineDataset(fixture.pool, { id: primaryScannerId, role: 'scanner' }, eventId);
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(dataset),
    });

    const secScan = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: secondaryScannerId,
        scannerName: 'สแกนสำรอง 2',
        isPrimary: false,
        qrPayloadOrCode: issuedTicketCode,
        action: 'entry',
      },
      storage,
    );

    expect(secScan.success).toBe(false);
    expect(secScan.status).toBe('rejected');
    expect(secScan.reason).toBe('NOT_PRIMARY_DEVICE');
  });

  it('4. Local write failure reports failure and rolls back state without claiming success (AC-103)', async () => {
    const dataset = await getOfflineDataset(fixture.pool, { id: primaryScannerId, role: 'scanner' }, eventId);
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(dataset),
    });

    storage.setFail(true);

    const failScan = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: issuedTicketCode,
        action: 'entry',
      },
      storage,
    );

    expect(failScan.success).toBe(false);
    expect(failScan.status).toBe('rejected');
    expect(failScan.reason).toBe('STORAGE_WRITE_FAILURE');
    expect(failScan.message).toContain('เกิดข้อผิดพลาดในการบันทึกข้อมูลลงอุปกรณ์ (Storage Error)');
  });
});
