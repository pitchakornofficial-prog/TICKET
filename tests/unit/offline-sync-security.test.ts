import { describe, expect, it, vi } from 'vitest';
import { syncOfflineAdmissionScans } from '../../src/server/admission';
import type { Pool, PoolClient } from 'pg';

const SESSION_START = '2026-11-12T10:00:00.000Z';
const SESSION_END = '2026-11-12T14:00:00.000Z';
const VALID_SCAN_TIME = '2026-11-12T11:00:00.000Z';

function createPrimaryScannerMockPool(
  mockClient: PoolClient,
  scannerId = 'auth-scanner-id',
): Pool {
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM event_scanners')) {
        return Promise.resolve({ rowCount: 1, rows: [{}] });
      }
      if (sql.includes('FROM event_primary_scanners')) {
        return Promise.resolve({ rowCount: 1, rows: [{ scannerId }] });
      }
      if (sql.includes('FROM event_offline_controls')) {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    }),
    connect: vi.fn().mockResolvedValue(mockClient),
  } as unknown as Pool;
}

describe('syncOfflineAdmissionScans cross-event, authorization, and state security', () => {
  it('prevents cross-event ticket mutation when primary scanner of event A supplies ticket of event B', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT') {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        // Ticket lookup with AND t."eventId" = $3
        if (sql.includes('FROM tickets')) {
          expect(sql).toContain('t."eventId" = $3');
          expect(params).toEqual(['ticket-event-b', 'TK-EVT-B', 'event-a']);
          // Simulating DB: ticket belongs to event-b, so searching under event-a returns empty rowCount
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = createPrimaryScannerMockPool(mockClient, 'scanner-event-a');

    const result = await syncOfflineAdmissionScans(
      mockPool,
      { id: 'scanner-event-a', role: 'scanner', name: 'Primary A' },
      'event-a',
      {
        scans: [
          {
            id: 'scan-x',
            ticketId: 'ticket-event-b',
            ticketCode: 'TK-EVT-B',
            sessionId: 'session-a',
            eventId: 'event-a',
            scannerId: 'scanner-event-a',
            scannerName: 'Primary A',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: VALID_SCAN_TIME,
          },
        ],
      },
    );

    expect(result.syncedCount).toBe(0);
    expect(result.conflictsCount).toBe(0);
    const updateCalls = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('UPDATE tickets'),
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('strictly derives scannerId and scannerName from actor session to prevent audit log spoofing', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        if (sql.includes('FROM tickets')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [
              {
                id: 'ticket-1',
                ticketCode: 'TK-12345',
                sessionId: 'session-1',
                eventId: 'event-1',
                status: 'valid',
                admissionStatus: 'outside',
                sessionStatus: 'approved',
                sessionStartTime: SESSION_START,
                sessionEndTime: SESSION_END,
                admissionStartTime: null,
                admissionEndTime: null,
              },
            ],
          });
        }
        if (sql.includes('UPDATE tickets')) {
          return Promise.resolve({ rowCount: 1, rows: [] });
        }
        if (sql.includes('INSERT INTO ticket_admission_logs')) {
          return Promise.resolve({ rowCount: 1, rows: [] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = createPrimaryScannerMockPool(mockClient, 'auth-scanner-id');

    const result = await syncOfflineAdmissionScans(
      mockPool,
      { id: 'auth-scanner-id', role: 'scanner', name: 'Verified Scanner Device' },
      'event-1',
      {
        scans: [
          {
            id: 'scan-spoof',
            ticketId: 'ticket-1',
            ticketCode: 'TK-12345',
            sessionId: 'session-1',
            eventId: 'event-1',
            scannerId: 'spoofed-attacker-id',
            scannerName: 'Fake Injected Scanner Name',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: VALID_SCAN_TIME,
          },
        ],
      },
    );

    expect(result.syncedCount).toBe(1);

    const logInsertCall = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO ticket_admission_logs'),
    );
    expect(logInsertCall).toBeDefined();
    const logParams = logInsertCall?.[1] as unknown[];
    expect(logParams[5]).toBe('auth-scanner-id');
    expect(logParams[6]).toBe('Verified Scanner Device');
    expect(logParams[5]).not.toBe('spoofed-attacker-id');
    expect(logParams[6]).not.toBe('Fake Injected Scanner Name');
  });

  it('rejects scan when session mismatch occurs between ticket and scan input', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT') {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        if (sql.includes('FROM tickets')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [
              {
                id: 'ticket-1',
                ticketCode: 'TK-12345',
                sessionId: 'session-actual',
                eventId: 'event-1',
                status: 'valid',
                admissionStatus: 'outside',
                sessionStatus: 'approved',
                sessionStartTime: SESSION_START,
                sessionEndTime: SESSION_END,
                admissionStartTime: null,
                admissionEndTime: null,
              },
            ],
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = createPrimaryScannerMockPool(mockClient, 'auth-scanner-id');

    const result = await syncOfflineAdmissionScans(
      mockPool,
      { id: 'auth-scanner-id', role: 'scanner', name: 'Verified Scanner Device' },
      'event-1',
      {
        scans: [
          {
            id: 'scan-wrong-session',
            ticketId: 'ticket-1',
            ticketCode: 'TK-12345',
            sessionId: 'session-different',
            eventId: 'event-1',
            scannerId: 'auth-scanner-id',
            scannerName: 'Verified Scanner Device',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: VALID_SCAN_TIME,
          },
        ],
      },
    );

    expect(result.syncedCount).toBe(0);
    const updateCalls = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('UPDATE tickets'),
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('blocks organizer and owner from bypassing primary scanner designation on offline sync', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 'event-1' }] }),
      connect: vi.fn(),
    } as unknown as Pool;

    await expect(
      syncOfflineAdmissionScans(
        mockPool,
        { id: 'organizer-1', role: 'organizer', name: 'Organizer' },
        'event-1',
        { scans: [] },
      ),
    ).rejects.toThrow(/เฉพาะเครื่องหลักประจำงานเท่านั้น/);

    await expect(
      syncOfflineAdmissionScans(
        mockPool,
        { id: 'owner-1', role: 'owner', name: 'Owner' },
        'event-1',
        { scans: [] },
      ),
    ).rejects.toThrow(/เฉพาะเครื่องหลักประจำงานเท่านั้น/);
  });

  it('rejects non-success scans (status=rejected), past/outside-window timestamps, and invalid state transitions', async () => {
    let currentAdmissionStatus: 'outside' | 'inside' = 'inside';
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT') {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        if (sql.includes('FROM tickets')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [
              {
                id: 'ticket-1',
                ticketCode: 'TK-12345',
                sessionId: 'session-1',
                eventId: 'event-1',
                status: 'valid',
                admissionStatus: currentAdmissionStatus,
                sessionStatus: 'approved',
                sessionStartTime: SESSION_START,
                sessionEndTime: SESSION_END,
                admissionStartTime: null,
                admissionEndTime: null,
              },
            ],
          });
        }
        if (sql.includes('UPDATE tickets')) {
          currentAdmissionStatus = (params?.[0] as 'outside' | 'inside') ?? currentAdmissionStatus;
          return Promise.resolve({ rowCount: 1, rows: [] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = createPrimaryScannerMockPool(mockClient, 'auth-scanner-id');

    const result = await syncOfflineAdmissionScans(
      mockPool,
      { id: 'auth-scanner-id', role: 'scanner', name: 'Primary' },
      'event-1',
      {
        scans: [
          // 1. status='rejected' with past timestamp -> must NOT count as synced or log success
          {
            id: 'scan-rejected-past',
            ticketId: 'ticket-1',
            ticketCode: 'TK-12345',
            sessionId: 'session-1',
            eventId: 'event-1',
            scannerId: 'auth-scanner-id',
            scannerName: 'Primary',
            action: 'exit',
            status: 'rejected',
            reason: 'NOT_INSIDE',
            deviceMode: 'offline',
            scannedAt: '2020-01-01T00:00:00.000Z',
          },
          // 2. status='success' but scannedAt outside admission window (in the past) -> must NOT mutate
          {
            id: 'scan-outside-window',
            ticketId: 'ticket-1',
            ticketCode: 'TK-12345',
            sessionId: 'session-1',
            eventId: 'event-1',
            scannerId: 'auth-scanner-id',
            scannerName: 'Primary',
            action: 'exit',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: '2026-11-12T08:00:00.000Z',
          },
          // 3. Invalid state transition: ticket is already 'inside', sending another 'entry' -> must NOT mutate
          {
            id: 'scan-duplicate-entry',
            ticketId: 'ticket-1',
            ticketCode: 'TK-12345',
            sessionId: 'session-1',
            eventId: 'event-1',
            scannerId: 'auth-scanner-id',
            scannerName: 'Primary',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: VALID_SCAN_TIME,
          },
        ],
      },
    );

    expect(result.syncedCount).toBe(0);
    expect(currentAdmissionStatus).toBe('inside');
    const updateCalls = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('UPDATE tickets'),
    );
    expect(updateCalls).toHaveLength(0);
    const insertCalls = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO ticket_admission_logs'),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it('orders multi-step offline sequence chronologically and applies valid entry -> exit -> entry transitions', async () => {
    let currentAdmissionStatus: 'outside' | 'inside' = 'outside';
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT') {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        if (sql.includes('FROM tickets')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [
              {
                id: 'ticket-1',
                ticketCode: 'TK-12345',
                sessionId: 'session-1',
                eventId: 'event-1',
                status: 'valid',
                admissionStatus: currentAdmissionStatus,
                sessionStatus: 'approved',
                sessionStartTime: SESSION_START,
                sessionEndTime: SESSION_END,
                admissionStartTime: null,
                admissionEndTime: null,
              },
            ],
          });
        }
        if (sql.includes('UPDATE tickets')) {
          currentAdmissionStatus = (params?.[0] as 'outside' | 'inside') ?? currentAdmissionStatus;
          return Promise.resolve({ rowCount: 1, rows: [] });
        }
        return Promise.resolve({ rowCount: 1, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = createPrimaryScannerMockPool(mockClient, 'auth-scanner-id');

    // Submitted out of order (exit before entry), server sorts by scannedAt ascending
    const result = await syncOfflineAdmissionScans(
      mockPool,
      { id: 'auth-scanner-id', role: 'scanner', name: 'Primary' },
      'event-1',
      {
        scans: [
          {
            id: 'scan-2-exit',
            ticketId: 'ticket-1',
            ticketCode: 'TK-12345',
            sessionId: 'session-1',
            eventId: 'event-1',
            scannerId: 'auth-scanner-id',
            scannerName: 'Primary',
            action: 'exit',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: '2026-11-12T11:30:00.000Z',
          },
          {
            id: 'scan-1-entry',
            ticketId: 'ticket-1',
            ticketCode: 'TK-12345',
            sessionId: 'session-1',
            eventId: 'event-1',
            scannerId: 'auth-scanner-id',
            scannerName: 'Primary',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: '2026-11-12T11:00:00.000Z',
          },
          {
            id: 'scan-3-reentry',
            ticketId: 'ticket-1',
            ticketCode: 'TK-12345',
            sessionId: 'session-1',
            eventId: 'event-1',
            scannerId: 'auth-scanner-id',
            scannerName: 'Primary',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: '2026-11-12T12:00:00.000Z',
          },
        ],
      },
    );

    expect(result.syncedCount).toBe(3);
    expect(result.acknowledgedIds).toEqual(['scan-1-entry', 'scan-2-exit', 'scan-3-reentry']);
    expect(currentAdmissionStatus).toBe('inside');
  });
});
