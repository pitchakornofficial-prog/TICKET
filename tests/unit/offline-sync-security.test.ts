import { describe, expect, it, vi } from 'vitest';
import { syncOfflineAdmissionScans } from '../../src/server/admission';
import type { Pool, PoolClient } from 'pg';

describe('syncOfflineAdmissionScans cross-event and audit security', () => {
  it('prevents cross-event ticket mutation when actor of event A supplies ticket of event B', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT') {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        // Ticket lookup with AND "eventId" = $3
        if (sql.includes('FROM tickets')) {
          expect(sql).toContain('"eventId" = $3');
          expect(params).toEqual(['ticket-event-b', 'TK-EVT-B', 'event-a']);
          // Simulating DB: ticket belongs to event-b, so searching under event-a returns empty rowCount
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        // Authorize organizer for event-a
        if (sql.includes('FROM events WHERE id = $1')) {
          return Promise.resolve({ rowCount: 1, rows: [{ id: 'event-a' }] });
        }
        // Admission schema & idempotency
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    const result = await syncOfflineAdmissionScans(
      mockPool,
      { id: 'organizer-1', role: 'organizer', name: 'Organizer A' },
      'event-a',
      {
        scans: [
          {
            id: 'scan-x',
            ticketId: 'ticket-event-b',
            ticketCode: 'TK-EVT-B',
            sessionId: 'session-a',
            eventId: 'event-a',
            scannerId: 'organizer-1',
            scannerName: 'Organizer A',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: new Date().toISOString(),
          },
        ],
      },
    );

    expect(result.syncedCount).toBe(0);
    expect(result.conflictsCount).toBe(0);
    // Verified that UPDATE tickets was never called
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

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM event_scanners')) {
          return Promise.resolve({ rowCount: 1, rows: [{}] });
        }
        if (sql.includes('FROM event_primary_scanners')) {
          return Promise.resolve({ rowCount: 1, rows: [{ scannerId: 'auth-scanner-id' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

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
            scannerId: 'spoofed-attacker-id', // Untrusted input
            scannerName: 'Fake Injected Scanner Name', // Untrusted input
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: new Date().toISOString(),
          },
        ],
      },
    );

    expect(result.syncedCount).toBe(1);

    // Verify INSERT INTO ticket_admission_logs arguments
    const logInsertCall = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO ticket_admission_logs'),
    );
    expect(logInsertCall).toBeDefined();
    const logParams = logInsertCall?.[1] as unknown[];
    // Parameter order: [scan.id, ticket.id, ticket.ticketCode, eventId, ticket.sessionId, effectiveScannerId, effectiveScannerName, scan.action, scannedAt]
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
              },
            ],
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM events WHERE id = $1')) {
          return Promise.resolve({ rowCount: 1, rows: [{ id: 'event-1' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    const result = await syncOfflineAdmissionScans(
      mockPool,
      { id: 'organizer-1', role: 'organizer', name: 'Organizer 1' },
      'event-1',
      {
        scans: [
          {
            id: 'scan-wrong-session',
            ticketId: 'ticket-1',
            ticketCode: 'TK-12345',
            sessionId: 'session-different', // Mismatch!
            eventId: 'event-1',
            scannerId: 'organizer-1',
            scannerName: 'Organizer 1',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: new Date().toISOString(),
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
});
