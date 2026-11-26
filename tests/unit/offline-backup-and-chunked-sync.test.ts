import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOfflineDatasetKey,
  getOfflinePendingScans,
  getOfflinePendingScansKey,
  performOfflineAdmissionScan,
  syncPendingOfflineScans,
  sortPendingScansInOrder,
  exportOfflineBackupAsync,
  importOfflineBackupAsync,
  OFFLINE_SYNC_CHUNK_SIZE,
  type OfflinePendingScanItem,
} from '../../src/lib/offline-admission';
import { hashOfflineQrPayload } from '../../src/lib/offline-qr-hash';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

describe('Offline Backup, 5,000+ Tickets Entry/Exit & Chunked Sync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sorts pending scans strictly by localSequence so entry precedes exit regardless of UUID order', () => {
    const unsorted: OfflinePendingScanItem[] = [
      {
        id: '0000-exit',
        ticketId: 't-1',
        ticketCode: 'TCK-001',
        sessionId: 's-1',
        eventId: 'ev-1',
        scannerId: 'sc-1',
        scannerName: 'Primary',
        action: 'exit',
        status: 'success',
        reason: null,
        deviceMode: 'offline',
        scannedAt: '2026-11-26T10:05:00.000Z',
        localSequence: 2,
      },
      {
        id: 'zzzz-entry',
        ticketId: 't-1',
        ticketCode: 'TCK-001',
        sessionId: 's-1',
        eventId: 'ev-1',
        scannerId: 'sc-1',
        scannerName: 'Primary',
        action: 'entry',
        status: 'success',
        reason: null,
        deviceMode: 'offline',
        scannedAt: '2026-11-26T10:00:00.000Z',
        localSequence: 1,
      },
    ];

    const sorted = sortPendingScansInOrder(unsorted);
    expect(sorted.map((s) => s.action)).toEqual(['entry', 'exit']);
  });

  it('chunks 1,200 pending scans into batches of 250 and preserves unacknowledged items if a chunk fails mid-sync', async () => {
    const storage = createMemoryStorage();
    const eventId = 'ev-chunk';
    const items: OfflinePendingScanItem[] = Array.from({ length: 1200 }, (_, idx) => ({
      id: `scan-${idx + 1}`,
      ticketId: `t-${(idx % 500) + 1}`,
      ticketCode: `TCK-${(idx % 500) + 1}`,
      sessionId: 's-1',
      eventId,
      scannerId: 'sc-1',
      scannerName: 'Primary',
      action: idx % 2 === 0 ? 'entry' : 'exit',
      status: 'success',
      reason: null,
      deviceMode: 'offline',
      scannedAt: new Date(Date.UTC(2026, 10, 26, 10, 0, idx)).toISOString(),
      localSequence: idx + 1,
    }));
    storage.setItem(getOfflinePendingScansKey(eventId), JSON.stringify(items));

    const batchSizes: number[] = [];
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body || '{}')) as { scans: OfflinePendingScanItem[] };
      batchSizes.push(parsed.scans.length);
      return new Response(
        JSON.stringify({
          acknowledgedIds: parsed.scans.map((s) => s.id),
          conflictsCount: 0,
          securityRejectionsCount: 0,
          lastSuccessfulSync: '2026-11-26T12:00:00.000Z',
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const progressUpdates: number[] = [];
    const res = await syncPendingOfflineScans(eventId, storage, {
      onProgress: (p) => progressUpdates.push(p.syncedSoFar),
    });

    expect(OFFLINE_SYNC_CHUNK_SIZE).toBe(250);
    expect(res.success).toBe(true);
    expect(res.acknowledgedCount).toBe(1200);
    expect(res.remainingCount).toBe(0);
    expect(batchSizes).toEqual([250, 250, 250, 250, 200]);
    expect(progressUpdates).toEqual([250, 500, 750, 1000, 1200]);

    // Test partial failure on chunk 3
    storage.setItem(getOfflinePendingScansKey(eventId), JSON.stringify(items));
    let callNum = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        callNum++;
        const parsed = JSON.parse(String(init?.body || '{}')) as { scans: OfflinePendingScanItem[] };
        if (callNum === 3) {
          return new Response(JSON.stringify({ message: 'Network hiccup' }), { status: 500 });
        }
        return new Response(
          JSON.stringify({
            acknowledgedIds: parsed.scans.map((s) => s.id),
            conflictsCount: 0,
            securityRejectionsCount: 0,
          }),
          { status: 200 },
        );
      }),
    );

    const partialRes = await syncPendingOfflineScans(eventId, storage);
    expect(partialRes.success).toBe(false);
    expect(partialRes.acknowledgedCount).toBe(500);
    expect(partialRes.remainingCount).toBe(700);
    expect(getOfflinePendingScans(eventId, storage)).toHaveLength(700);
  });

  it('handles 5,000 tickets and repeated entry/exit transitions cleanly', () => {
    const storage = createMemoryStorage();
    const eventId = 'ev-5k';
    const now = new Date('2026-11-26T18:00:00.000Z');
    const tickets = Array.from({ length: 5000 }, (_, i) => ({
      id: `t-${i + 1}`,
      ticketCode: `UBU-${String(i + 1).padStart(5, '0')}`,
      qrHash: hashOfflineQrPayload(eventId, `QR-${i + 1}`),
      ticketTypeId: 'tt-1',
      ticketTypeName: 'VIP',
      sessionId: 'sess-1',
      status: 'valid' as const,
      admissionStatus: 'outside' as const,
      isRefunded: false,
      admissionWindow: {
        startTime: '2026-11-26T17:00:00.000Z',
        endTime: '2026-11-26T23:59:00.000Z',
        admissionStartTime: '2026-11-26T16:00:00.000Z',
        admissionEndTime: '2026-11-26T23:59:00.000Z',
      },
    }));

    storage.setItem(
      getOfflineDatasetKey(eventId),
      JSON.stringify({
        event: { id: eventId, title: '5K Fest', location: 'Hall', status: 'approved' },
        primaryScanner: {
          scannerId: 'sc-primary',
          scannerName: 'Primary',
          scannerEmail: 'p@ticket.local',
          assignedAt: '2026-11-26T10:00:00.000Z',
          assignmentEpoch: 1,
          assignmentToken: 'tok-1',
        },
        isCurrentScannerPrimary: true,
        sessions: [],
        tickets,
        admissionLogs: [],
        lastSuccessfulSync: '2026-11-26T10:00:00.000Z',
        syncTimestamp: '2026-11-26T10:00:00.000Z',
        totalTickets: 5000,
      }),
    );

    const entry1 = performOfflineAdmissionScan(
      {
        eventId,
        sessionId: 'sess-1',
        scannerId: 'sc-primary',
        scannerName: 'Primary',
        isPrimary: true,
        qrPayloadOrCode: 'QR-4999',
        action: 'entry',
        now,
      },
      storage,
    );
    expect(entry1.success).toBe(true);
    expect(entry1.ticket?.admissionStatus).toBe('inside');

    const exit1 = performOfflineAdmissionScan(
      {
        eventId,
        sessionId: 'sess-1',
        scannerId: 'sc-primary',
        scannerName: 'Primary',
        isPrimary: true,
        qrPayloadOrCode: 'UBU-04999',
        action: 'exit',
        now,
      },
      storage,
    );
    expect(exit1.success).toBe(true);
    expect(exit1.ticket?.admissionStatus).toBe('outside');

    const entry2 = performOfflineAdmissionScan(
      {
        eventId,
        sessionId: 'sess-1',
        scannerId: 'sc-primary',
        scannerName: 'Primary',
        isPrimary: true,
        qrPayloadOrCode: 'QR-4999',
        action: 'entry',
        now,
      },
      storage,
    );
    expect(entry2.success).toBe(true);
    expect(entry2.ticket?.admissionStatus).toBe('inside');
    expect(entry2.pendingCount).toBe(3);
  });

  it('exports verifiable JSON backup and imports without duplicating existing pending scans', async () => {
    const storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const eventId = 'ev-backup';
    const scans: OfflinePendingScanItem[] = [
      {
        id: 'scan-a',
        ticketId: 't-1',
        ticketCode: 'TCK-1',
        sessionId: 's-1',
        eventId,
        scannerId: 'sc-1',
        scannerName: 'Primary',
        action: 'entry',
        status: 'success',
        reason: null,
        deviceMode: 'offline',
        scannedAt: '2026-11-26T10:00:00.000Z',
        localSequence: 1,
      },
      {
        id: 'scan-b',
        ticketId: 't-1',
        ticketCode: 'TCK-1',
        sessionId: 's-1',
        eventId,
        scannerId: 'sc-1',
        scannerName: 'Primary',
        action: 'exit',
        status: 'success',
        reason: null,
        deviceMode: 'offline',
        scannedAt: '2026-11-26T10:10:00.000Z',
        localSequence: 2,
      },
    ];
    storage.setItem(getOfflinePendingScansKey(eventId), JSON.stringify(scans));

    const exported = await exportOfflineBackupAsync(eventId);
    expect(exported.pendingScansCount).toBe(2);
    expect(exported.checksum).toBeTruthy();

    // Tampered checksum rejected
    const tampered = JSON.stringify({ ...exported, checksum: 'bad-checksum' });
    await expect(importOfflineBackupAsync(eventId, tampered)).rejects.toThrow(/Checksum/);

    // Keep only scan-a in storage, then import backup containing scan-a + scan-b
    storage.setItem(getOfflinePendingScansKey(eventId), JSON.stringify([scans[0]]));
    const merged = await importOfflineBackupAsync(eventId, JSON.stringify(exported));
    expect(merged.importedCount).toBe(1);
    expect(merged.skippedDuplicates).toBe(1);
    expect(merged.totalPendingCount).toBe(2);
  });
});
