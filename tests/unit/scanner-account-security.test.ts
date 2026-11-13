import { describe, expect, it, vi } from 'vitest';
import { hashPassword } from 'better-auth/crypto';
import { addScannerToEvent } from '../../src/server/events';
import {
  getScannerEventScopeCookie,
  signScannerEventScopeCookie,
  verifyScannerSessionEventScope,
} from '../../src/server/scanner-scope';
import type { Pool, PoolClient } from 'pg';

describe('Scanner Account Security and Scope Isolation (Issue #3)', () => {
  const testSecret = 'test-better-auth-secret-32-chars-long!!';

  it('rejects adding an existing scanner without password', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, role, name FROM auth_user WHERE email = $1')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ id: 'scanner-alice-id', role: 'scanner', name: 'Alice Scanner' }],
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT "organizerId" FROM events WHERE id = $1')) {
          return Promise.resolve({ rowCount: 1, rows: [{ organizerId: 'org-b' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    // Organizer B tries to add Alice by email without password
    await expect(
      addScannerToEvent(mockPool, 'org-b', 'event-b', {
        name: 'Alice',
        email: 'alice@scanner.invalid',
      }),
    ).rejects.toThrow('บัญชีทีมสแกนนี้มีอยู่ในระบบแล้ว กรุณาระบุรหัสผ่านที่ถูกต้องของบัญชีเพื่อยืนยันการเพิ่มเข้างาน');
  });

  it('rejects adding an existing scanner with incorrect password', async () => {
    const realPasswordHash = await hashPassword('Alice-Secret-Password!001');

    const mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, role, name FROM auth_user WHERE email = $1')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ id: 'scanner-alice-id', role: 'scanner', name: 'Alice Scanner' }],
          });
        }
        if (sql.includes('SELECT password FROM auth_account WHERE "userId" = $1')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ password: realPasswordHash }],
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT "organizerId" FROM events WHERE id = $1')) {
          return Promise.resolve({ rowCount: 1, rows: [{ organizerId: 'org-b' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    // Organizer B tries with wrong password
    await expect(
      addScannerToEvent(mockPool, 'org-b', 'event-b', {
        name: 'Alice',
        email: 'alice@scanner.invalid',
        password: 'Wrong-Guessed-Password!999',
      }),
    ).rejects.toThrow('รหัสผ่านของบัญชีทีมสแกนเดิมไม่ถูกต้อง');
  });

  it('accepts adding an existing scanner with matching password', async () => {
    const realPassword = 'Alice-Secret-Password!001';
    const realPasswordHash = await hashPassword(realPassword);

    const mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, role, name FROM auth_user WHERE email = $1')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ id: 'scanner-alice-id', role: 'scanner', name: 'Alice Scanner' }],
          });
        }
        if (sql.includes('SELECT password FROM auth_account WHERE "userId" = $1')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ password: realPasswordHash }],
          });
        }
        if (sql.includes('INSERT INTO event_scanners')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ id: 'assign-uuid-1' }],
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT "organizerId" FROM events WHERE id = $1')) {
          return Promise.resolve({ rowCount: 1, rows: [{ organizerId: 'org-b' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    // Organizer B supplies correct password
    const result = await addScannerToEvent(mockPool, 'org-b', 'event-b', {
      name: 'Alice',
      email: 'alice@scanner.invalid',
      password: realPassword,
    });

    expect(result.scannerId).toBe('scanner-alice-id');
    expect(result.name).toBe('Alice Scanner');
    expect(result.id).toBe('assign-uuid-1');
  });

  it('correctly signs and parses scanner_event_scope cookie', () => {
    const signed = signScannerEventScopeCookie('event-xyz-123', testSecret);
    const cookieHeader = `ticket.session_token=abc; scanner_event_scope=${signed}; other=1`;

    const extracted = getScannerEventScopeCookie(cookieHeader, testSecret);
    expect(extracted).toBe('event-xyz-123');

    // Tampered cookie is rejected
    const tampered = `scanner_event_scope=event-other-999.fakeSignature`;
    expect(getScannerEventScopeCookie(tampered, testSecret)).toBeNull();
  });

  it('enforces event isolation for direct access scanner sessions', async () => {
    const mockPool = {
      query: vi.fn().mockImplementation((_sql: string, params?: unknown[]) => {
        if (params?.[0] === 'session-event-a') {
          return Promise.resolve({ rowCount: 1, rows: [{ eventId: 'event-a' }] });
        }
        if (params?.[0] === 'session-event-b') {
          return Promise.resolve({ rowCount: 1, rows: [{ eventId: 'event-b' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
    } as unknown as Pool;

    const signedCookieForB = signScannerEventScopeCookie('event-b', testSecret);
    const cookieHeader = `scanner_event_scope=${signedCookieForB}`;

    // 1. Session scoped to Event B accessing Event B by eventId -> ALLOWED
    const checkB = await verifyScannerSessionEventScope(
      mockPool,
      'scanner',
      cookieHeader,
      testSecret,
      { eventId: 'event-b' },
    );
    expect(checkB.allowed).toBe(true);

    // 2. Session scoped to Event B attempting to access Event A by eventId -> FORBIDDEN
    const checkA = await verifyScannerSessionEventScope(
      mockPool,
      'scanner',
      cookieHeader,
      testSecret,
      { eventId: 'event-a' },
    );
    expect(checkA.allowed).toBe(false);
    expect(checkA.reason).toContain('จำกัดสิทธิ์เฉพาะงานคอนเสิร์ต');

    // 3. Session scoped to Event B attempting to access Event A via sessionId -> FORBIDDEN
    const checkSessA = await verifyScannerSessionEventScope(
      mockPool,
      'scanner',
      cookieHeader,
      testSecret,
      { sessionId: 'session-event-a' },
    );
    expect(checkSessA.allowed).toBe(false);

    // 4. Session scoped to Event B accessing sessionId belonging to Event B -> ALLOWED
    const checkSessB = await verifyScannerSessionEventScope(
      mockPool,
      'scanner',
      cookieHeader,
      testSecret,
      { sessionId: 'session-event-b' },
    );
    expect(checkSessB.allowed).toBe(true);

    // 5. Non-scanner roles (e.g. organizer or owner) are not restricted by scanner scope cookie
    const checkOrg = await verifyScannerSessionEventScope(
      mockPool,
      'organizer',
      cookieHeader,
      testSecret,
      { eventId: 'event-a' },
    );
    expect(checkOrg.allowed).toBe(true);
  });

  it('enforces scanner quota atomically inside transaction with pg_advisory_xact_lock', async () => {
    const executedSql: string[] = [];
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        executedSql.push(sql);
        if (sql.includes('FROM event_scanners')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ totalCount: '4', additionalCount: '3' }],
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT "organizerId" FROM events WHERE id = $1')) {
          return Promise.resolve({ rowCount: 1, rows: [{ organizerId: 'org-b' }] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    await expect(
      addScannerToEvent(mockPool, 'org-b', 'event-b', {
        name: 'Extra Scanner',
        email: 'extra@scanner.invalid',
      }),
    ).rejects.toThrow('จำกัดจำนวนทีมสแกนเพิ่มเติมไม่เกิน 3 คนต่อคอนเสิร์ต');

    expect(executedSql.some(s => s.includes('pg_advisory_xact_lock'))).toBe(true);
  });
});
