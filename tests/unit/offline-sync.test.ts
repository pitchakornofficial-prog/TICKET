import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  syncPendingOfflineScans,
  getOfflinePendingScans,
  getOfflineDatasetKey,
  performOfflineAdmissionScan,
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

describe('TASK-034: Offline Sync Unit Tests (AC-99, AC-102)', () => {
  const eventId = 'EVT-SYNC-001';
  const sessionId = 'SESS-SYNC-001';
  const now = new Date('2026-11-01T11:00:00.000Z');

  const validTicket1: OfflineTicketItem = {
    id: 'TICK-SYNC-001',
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

  const validTicket2: OfflineTicketItem = {
    id: 'TICK-SYNC-002',
    ticketCode: 'TK-22222222',
    qrPayload: 'SECURE-QR-222',
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
      assignedAt: '2026-11-01T08:00:00.000Z',
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
    tickets: [validTicket1, validTicket2],
    admissionLogs: [],
    lastSuccessfulSync: '2026-11-01T08:00:00.000Z',
    syncTimestamp: '2026-11-01T08:00:00.000Z',
    totalTickets: 2,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles empty pending queue gracefully without network call', async () => {
    const storage = createMockStorage();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await syncPendingOfflineScans(eventId, storage);

    expect(result.success).toBe(true);
    expect(result.acknowledgedCount).toBe(0);
    expect(result.remainingCount).toBe(0);
    expect(result.conflictsCount).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('syncs pending scans and removes acknowledged items from local storage (AC-102)', async () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(baseDataset),
    });

    // Perform two offline scans
    const scan1 = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'SECURE-QR-111',
        action: 'entry',
        now,
      },
      storage,
    );
    expect(scan1.success).toBe(true);

    const scan2 = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'SECURE-QR-222',
        action: 'entry',
        now: new Date(now.getTime() + 1000),
      },
      storage,
    );
    expect(scan2.success).toBe(true);

    const pendingBefore = getOfflinePendingScans(eventId, storage);
    expect(pendingBefore).toHaveLength(2);

    const fakeServerResponse = {
      syncedCount: 2,
      conflictsCount: 0,
      acknowledgedIds: [pendingBefore[0].id, pendingBefore[1].id],
      conflicts: [],
      lastSuccessfulSync: '2026-11-01T11:05:00.000Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeServerResponse,
      })
    );

    const result = await syncPendingOfflineScans(eventId, storage);

    expect(result.success).toBe(true);
    expect(result.acknowledgedCount).toBe(2);
    expect(result.remainingCount).toBe(0);
    expect(result.conflictsCount).toBe(0);

    // Queue must be empty after full acknowledgement
    const pendingAfter = getOfflinePendingScans(eventId, storage);
    expect(pendingAfter).toHaveLength(0);
  });

  it('handles partial acknowledgement by keeping unacknowledged items in pending queue (AC-102)', async () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(baseDataset),
    });

    performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'SECURE-QR-111',
        action: 'entry',
        now,
      },
      storage,
    );

    performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'SECURE-QR-222',
        action: 'entry',
        now: new Date(now.getTime() + 2000),
      },
      storage,
    );

    const pendingBefore = getOfflinePendingScans(eventId, storage);
    expect(pendingBefore).toHaveLength(2);

    // Server only acknowledges the first scan
    const fakeServerResponse = {
      syncedCount: 1,
      conflictsCount: 0,
      acknowledgedIds: [pendingBefore[0].id],
      conflicts: [],
      lastSuccessfulSync: '2026-11-01T11:05:00.000Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeServerResponse,
      })
    );

    const result = await syncPendingOfflineScans(eventId, storage);

    expect(result.success).toBe(true);
    expect(result.acknowledgedCount).toBe(1);
    expect(result.remainingCount).toBe(1);

    // Only the second scan remains in pending queue
    const pendingAfter = getOfflinePendingScans(eventId, storage);
    expect(pendingAfter).toHaveLength(1);
    expect(pendingAfter[0].id).toBe(pendingBefore[1].id);
  });

  it('preserves pending scans in storage if server returns error or network fails', async () => {
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(baseDataset),
    });

    performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: 'SCAN-PRI',
        scannerName: 'ทีมสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: 'SECURE-QR-111',
        action: 'entry',
        now,
      },
      storage,
    );

    const pendingBefore = getOfflinePendingScans(eventId, storage);
    expect(pendingBefore).toHaveLength(1);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal Server Error' }),
      })
    );

    const result = await syncPendingOfflineScans(eventId, storage);

    expect(result.success).toBe(false);
    expect(result.acknowledgedCount).toBe(0);
    expect(result.remainingCount).toBe(1);

    // Queue must still retain item
    const pendingAfter = getOfflinePendingScans(eventId, storage);
    expect(pendingAfter).toHaveLength(1);
  });
});
