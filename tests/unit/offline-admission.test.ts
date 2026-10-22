import { describe, expect, it } from 'vitest';
import {
  performOfflineAdmissionScan,
  getOfflinePendingScans,
  getOfflineDatasetKey,
} from '../../src/lib/offline-admission';
import type { OfflineDataset, OfflineTicketItem } from '../../src/server/primary-scanner';

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

describe('TASK-033: Offline Admission Engine Unit Tests (AC-40, AC-41, AC-50, AC-96, AC-103)', () => {
  const eventId = 'EVT-OFFLINE-001';
  const sessionId = 'SESS-OFFLINE-001';
  const now = new Date('2026-11-01T11:00:00.000Z');

  const validTicket1: OfflineTicketItem = {
    id: 'TICK-001',
    ticketCode: 'TK-11111111',
    qrPayload: 'SECURE-QR-111',
    ticketTypeId: 'TT-REG',
    ticketTypeName: 'Regular Zone',
    sessionId,
    status: 'valid',
    admissionStatus: 'outside',
    isRefunded: false,
    admissionWindow: {
      startTime: '2026-11-01T10:00:00.000Z',
      endTime: '2026-11-01T14:00:00.000Z',
      admissionStartTime: '2026-11-01T09:00:00.000Z',
      admissionEndTime: '2026-11-01T15:00:00.000Z',
    },
  };

  const cancelledTicket: OfflineTicketItem = {
    id: 'TICK-002',
    ticketCode: 'TK-22222222',
    qrPayload: 'SECURE-QR-222',
    ticketTypeId: 'TT-REG',
    ticketTypeName: 'Regular Zone',
    sessionId,
    status: 'cancelled',
    admissionStatus: 'outside',
    isRefunded: false,
    admissionWindow: {
      startTime: '2026-11-01T10:00:00.000Z',
      endTime: '2026-11-01T14:00:00.000Z',
    },
  };

  const refundedTicket: OfflineTicketItem = {
    id: 'TICK-003',
    ticketCode: 'TK-33333333',
    qrPayload: 'SECURE-QR-333',
    ticketTypeId: 'TT-REG',
    ticketTypeName: 'Regular Zone',
    sessionId,
    status: 'refunded',
    admissionStatus: 'outside',
    isRefunded: true,
    admissionWindow: {
      startTime: '2026-11-01T10:00:00.000Z',
      endTime: '2026-11-01T14:00:00.000Z',
    },
  };

  const wrongSessionTicket: OfflineTicketItem = {
    id: 'TICK-004',
    ticketCode: 'TK-44444444',
    qrPayload: 'SECURE-QR-444',
    ticketTypeId: 'TT-REG',
    ticketTypeName: 'Regular Zone',
    sessionId: 'SESS-OTHER',
    status: 'valid',
    admissionStatus: 'outside',
    isRefunded: false,
    admissionWindow: {
      startTime: '2026-11-02T10:00:00.000Z',
      endTime: '2026-11-02T14:00:00.000Z',
    },
  };

  const baseDataset: OfflineDataset = {
    event: {
      id: eventId,
      title: 'ร็อกคอนเสิร์ต ออฟไลน์',
      location: 'อิมแพ็ค อารีน่า',
      status: 'approved',
    },
    primaryScanner: {
      scannerId: 'SCAN-PRI',
      scannerName: 'ทีมสแกน 1',
      scannerEmail: 'scanner1@ticket.invalid',
      assignedAt: new Date().toISOString(),
    },
    isCurrentScannerPrimary: true,
    sessions: [
      {
        id: sessionId,
        startTime: '2026-11-01T10:00:00.000Z',
        endTime: '2026-11-01T14:00:00.000Z',
        admissionStartTime: '2026-11-01T09:00:00.000Z',
        admissionEndTime: '2026-11-01T15:00:00.000Z',
        status: 'approved',
        ticketTypes: [{ id: 'TT-REG', name: 'Regular Zone', price: 1000 }],
      },
    ],
    tickets: [validTicket1, cancelledTicket, refundedTicket, wrongSessionTicket],
    admissionLogs: [],
    lastSuccessfulSync: '2026-10-22T10:00:00.000Z',
    syncTimestamp: '2026-10-22T10:00:00.000Z',
    totalTickets: 4,
  };

  it('1. Secondary scanner cannot perform offline scan (AC-40, O1)', () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(baseDataset),
    });

    const result = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-SEC',
        scannerName: 'ทีมสแกนสำรอง',
        isPrimary: false, // NOT primary
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now,
      },
      storage,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('NOT_PRIMARY_DEVICE');
    expect(result.message).toContain('เครื่องนี้ไม่ใช่เครื่องหลักประจำงาน');
  });

  it('2. Missing or newly bought ticket not in offline dataset informs user to wait for online connection (AC-41, O2)', () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(baseDataset),
    });

    const result = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-NEW-OR-UNKNOWN',
        action: 'entry',
        now,
      },
      storage,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('OFFLINE_TICKET_NOT_FOUND');
    expect(result.message).toBe('ไม่พบข้อมูลบัตรในชุดข้อมูลออฟไลน์ กรุณารอเชื่อมต่อออนไลน์ (AC-41, O2)');
  });

  it('3. Offline state transitions: entry -> repeat denial -> exit -> repeat denial -> reentry (AC-96, AC-50)', () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(baseDataset),
    });

    // Step A: First Entry (outside -> inside)
    const entry1 = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now,
      },
      storage,
    );
    expect(entry1.success).toBe(true);
    expect(entry1.status).toBe('success');
    expect(entry1.ticket?.admissionStatus).toBe('inside');
    expect(entry1.pendingCount).toBe(1);

    // Verify localStorage has 1 pending scan and updated ticket status inside
    let pending = getOfflinePendingScans(eventId, storage);
    expect(pending.length).toBe(1);
    expect(pending[0].ticketCode).toBe('TK-11111111');
    expect(pending[0].action).toBe('entry');
    expect(pending[0].status).toBe('success');

    // Step B: Repeat Entry while inside (denial: ALREADY_INSIDE)
    const repeatEntry = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now,
      },
      storage,
    );
    expect(repeatEntry.success).toBe(false);
    expect(repeatEntry.status).toBe('rejected');
    expect(repeatEntry.reason).toBe('ALREADY_INSIDE');
    expect(repeatEntry.message).toContain('บัตรอยู่ในพื้นที่จัดงานแล้ว');
    // Pending count remains 1
    pending = getOfflinePendingScans(eventId, storage);
    expect(pending.length).toBe(1);

    // Step C: Exit scan (inside -> outside)
    const exit1 = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'exit',
        now,
      },
      storage,
    );
    expect(exit1.success).toBe(true);
    expect(exit1.status).toBe('success');
    expect(exit1.ticket?.admissionStatus).toBe('outside');
    expect(exit1.pendingCount).toBe(2);

    pending = getOfflinePendingScans(eventId, storage);
    expect(pending.length).toBe(2);
    expect(pending[1].action).toBe('exit');

    // Step D: Repeat Exit while outside (denial: NOT_INSIDE)
    const repeatExit = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'exit',
        now,
      },
      storage,
    );
    expect(repeatExit.success).toBe(false);
    expect(repeatExit.status).toBe('rejected');
    expect(repeatExit.reason).toBe('NOT_INSIDE');
    expect(repeatExit.message).toContain('บัตรอยู่นอกพื้นที่จัดงาน');

    // Step E: Reentry scan (outside -> inside)
    const reentry = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now,
      },
      storage,
    );
    expect(reentry.success).toBe(true);
    expect(reentry.status).toBe('success');
    expect(reentry.ticket?.admissionStatus).toBe('inside');
    expect(reentry.pendingCount).toBe(3);

    pending = getOfflinePendingScans(eventId, storage);
    expect(pending.length).toBe(3);
    expect(pending[2].action).toBe('entry');
  });

  it('4. Local write failure must fail scan and NOT claim success (AC-103)', () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(baseDataset),
    });

    // Make setItem throw (simulate QuotaExceededError or storage unavailable)
    storage.setFail(true);

    const result = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now,
      },
      storage,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('STORAGE_WRITE_FAILURE');
    expect(result.message).toContain('เกิดข้อผิดพลาดในการบันทึกข้อมูลลงอุปกรณ์ (Storage Error)');

    // Verify storage has no pending records written
    storage.setFail(false);
    const pending = getOfflinePendingScans(eventId, storage);
    expect(pending.length).toBe(0);
  });

  it('5. Offline validations: cancelled, refunded, wrong session, outside admission window (AC-100, AC-101)', () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(baseDataset),
    });

    // A. Cancelled ticket
    const cancelledRes = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-22222222',
        action: 'entry',
        now,
      },
      storage,
    );
    expect(cancelledRes.success).toBe(false);
    expect(cancelledRes.reason).toBe('TICKET_CANCELLED');

    // B. Refunded ticket
    const refundedRes = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-33333333',
        action: 'entry',
        now,
      },
      storage,
    );
    expect(refundedRes.success).toBe(false);
    expect(refundedRes.reason).toBe('TICKET_REFUNDED');

    // C. Wrong session ticket
    const wrongSessionRes = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-44444444',
        action: 'entry',
        now,
      },
      storage,
    );
    expect(wrongSessionRes.success).toBe(false);
    expect(wrongSessionRes.reason).toBe('WRONG_SESSION');

    // D. Outside admission window (too early)
    const tooEarlyTime = new Date('2026-11-01T08:00:00.000Z');
    const tooEarlyRes = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now: tooEarlyTime,
      },
      storage,
    );
    expect(tooEarlyRes.success).toBe(false);
    expect(tooEarlyRes.reason).toBe('OUTSIDE_ADMISSION_WINDOW');
    expect(tooEarlyRes.message).toContain('ยังไม่ถึงช่วงเวลาเปิดรับเข้างาน');
  });
});
