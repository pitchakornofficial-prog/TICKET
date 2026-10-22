import { describe, expect, it } from 'vitest';
import {
  performOfflineAdmissionScan,
  getOfflineDatasetKey,
} from '../../src/lib/offline-admission';
import type { OfflineDataset, OfflineTicketItem } from '../../src/server/primary-scanner';

function createMockStorage(initialData: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initialData));
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
  };
}

describe('TASK-035: Primary Handover & Emergency Recovery Unit Tests (AC-97, AC-98)', () => {
  const eventId = 'EVT-HANDOVER-001';
  const sessionId = 'SESS-HANDOVER-001';
  const now = new Date('2026-11-01T11:00:00.000Z');

  const validTicket: OfflineTicketItem = {
    id: 'TICK-HND-001',
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
    },
  };

  const activeDataset: OfflineDataset = {
    event: {
      id: eventId,
      title: 'งานแสดงดนตรี แฮนด์โอเวอร์',
      location: 'ฮอลล์ 1',
      status: 'approved',
    },
    primaryScanner: {
      scannerId: 'SCAN-PRI-1',
      scannerName: 'เครื่องหลักเดิม',
      scannerEmail: 'pri1@ticket.invalid',
      assignedAt: '2026-11-01T08:00:00.000Z',
    },
    isCurrentScannerPrimary: true,
    sessions: [
      {
        id: sessionId,
        startTime: '2026-11-01T10:00:00.000Z',
        endTime: '2026-11-01T14:00:00.000Z',
        status: 'approved',
        ticketTypes: [{ id: 'TT-REG', name: 'Regular Zone', price: 1000 }],
      },
    ],
    tickets: [validTicket],
    admissionLogs: [],
    lastSuccessfulSync: '2026-11-01T08:00:00.000Z',
    syncTimestamp: '2026-11-01T08:00:00.000Z',
    totalTickets: 1,
    offlineStatus: 'active',
    isOfflineHalted: false,
  };

  it('1. Offline scan succeeds when offline status is active and scanner is primary (AC-40, AC-50)', () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(activeDataset),
    });

    const result = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI-1',
        scannerName: 'เครื่องหลักเดิม',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now,
      },
      storage,
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('success');
  });

  it('2. Rejects offline scan when offline admission is halted for reconciliation (AC-98, NQ-06)', () => {
    const haltedDataset: OfflineDataset = {
      ...activeDataset,
      offlineStatus: 'halted_reconciliation_required',
      isOfflineHalted: true,
    };

    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(haltedDataset),
    });

    const result = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI-1',
        scannerName: 'เครื่องหลักเดิม',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now,
      },
      storage,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('OFFLINE_HALTED_RECONCILIATION');
    expect(result.message).toContain('การสแกนออฟไลน์ถูกระงับเพื่อกระทบยอด (AC-98)');
  });

  it('3. Secondary scanner cannot scan offline even when dataset is cached (AC-40, O1)', () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(activeDataset),
    });

    const result = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-SEC-2',
        scannerName: 'เครื่องรอง',
        isPrimary: false,
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now,
      },
      storage,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('NOT_PRIMARY_DEVICE');
  });

  it('4. Rejects scan when offline dataset is corrupted or missing (AC-41)', () => {
    const storage = createMockStorage();

    const result = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI-1',
        scannerName: 'เครื่องหลักเดิม',
        isPrimary: true,
        qrPayloadOrCode: 'TK-11111111',
        action: 'entry',
        now,
      },
      storage,
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('NO_OFFLINE_DATASET');
  });
});
