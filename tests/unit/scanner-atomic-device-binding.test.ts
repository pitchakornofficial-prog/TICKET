import { describe, expect, it, vi } from 'vitest';
import {
  resolveScannerSessionScope,
  resolveScannerSessionScopedEventId,
  signScannerEventScopeCookie,
  verifyScannerSessionEventScope,
} from '../../src/server/scanner-scope';
import type { Pool } from 'pg';

describe('Issue #9: Scanner Atomic Device Binding & Verification (D-104)', () => {
  const testSecret = 'test-better-auth-secret-32-chars-long!!';
  const eventId = 'ev-100';
  const scannerId = 'sc-200';
  const boundDeviceId = 'device-authorized-uuid';

  describe('verifyScannerSessionEventScope Device Binding Enforcement', () => {
    it('allows scanner request when scanner_device_id cookie matches boundDeviceId', async () => {
      const mockPool = {
        query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
          if (sql.includes('SELECT "boundDeviceId" FROM event_scanners')) {
            expect(params).toEqual([eventId, scannerId]);
            return Promise.resolve({
              rowCount: 1,
              rows: [{ boundDeviceId }],
            });
          }
          return Promise.resolve({ rowCount: 0, rows: [] });
        }),
      } as unknown as Pool;

      const signedScope = signScannerEventScopeCookie(eventId, testSecret);
      const cookieHeader = `scanner_event_scope=${signedScope}; scanner_device_id=${boundDeviceId}`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId, scannerId },
      );

      expect(check.allowed).toBe(true);
    });

    it('rejects scanner request when scanner_device_id cookie does NOT match boundDeviceId', async () => {
      const mockPool = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('SELECT "boundDeviceId" FROM event_scanners')) {
            return Promise.resolve({
              rowCount: 1,
              rows: [{ boundDeviceId }],
            });
          }
          return Promise.resolve({ rowCount: 0, rows: [] });
        }),
      } as unknown as Pool;

      const signedScope = signScannerEventScopeCookie(eventId, testSecret);
      const cookieHeader = `scanner_event_scope=${signedScope}; scanner_device_id=unauthorized-device-uuid`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId, scannerId },
      );

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('อุปกรณ์นี้ไม่ได้ผูกกับสิทธิ์เจ้าหน้าที่สแกนบัตร');
    });

    it('rejects scanner request when scanner_device_id cookie is missing for bound scanner', async () => {
      const mockPool = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('SELECT "boundDeviceId" FROM event_scanners')) {
            return Promise.resolve({
              rowCount: 1,
              rows: [{ boundDeviceId }],
            });
          }
          return Promise.resolve({ rowCount: 0, rows: [] });
        }),
      } as unknown as Pool;

      const signedScope = signScannerEventScopeCookie(eventId, testSecret);
      // Only event scope cookie, no scanner_device_id cookie
      const cookieHeader = `scanner_event_scope=${signedScope}`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId, scannerId },
      );

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('อุปกรณ์นี้ไม่ได้ผูกกับสิทธิ์เจ้าหน้าที่สแกนบัตร');
    });

    it('resolves eventId from sessionId and enforces device binding check', async () => {
      const sessionId = 'sess-500';
      const mockPool = {
        query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
          if (sql.includes('SELECT "eventId" FROM event_sessions')) {
            expect(params?.[0]).toBe(sessionId);
            return Promise.resolve({
              rowCount: 1,
              rows: [{ eventId }],
            });
          }
          if (sql.includes('SELECT "boundDeviceId" FROM event_scanners')) {
            return Promise.resolve({
              rowCount: 1,
              rows: [{ boundDeviceId }],
            });
          }
          return Promise.resolve({ rowCount: 0, rows: [] });
        }),
      } as unknown as Pool;

      const signedScope = signScannerEventScopeCookie(eventId, testSecret);
      const cookieHeader = `scanner_event_scope=${signedScope}; scanner_device_id=wrong-device`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { sessionId, scannerId },
      );

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('อุปกรณ์นี้ไม่ได้ผูกกับสิทธิ์เจ้าหน้าที่สแกนบัตร');
    });

    it('allows organizer or owner role regardless of scanner device binding', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const checkOrg = await verifyScannerSessionEventScope(
        mockPool,
        'organizer',
        null,
        testSecret,
        { eventId, scannerId },
      );
      expect(checkOrg.allowed).toBe(true);

      const checkOwner = await verifyScannerSessionEventScope(
        mockPool,
        'owner',
        null,
        testSecret,
        { eventId, scannerId },
      );
      expect(checkOwner.allowed).toBe(true);
    });
  });

  describe('Issue #3: Server-side Scanner Scope & Cookie Tampering Prevention', () => {
    const eventA = 'event-aaa';
    const eventB = 'event-bbb';

    it('rejects access to event B when scope cookie is for event A', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const signedScopeA = signScannerEventScopeCookie(eventA, testSecret);
      const cookieHeader = `scanner_event_scope=${signedScopeA}; scanner_device_id=${boundDeviceId}`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId: eventB, scannerId },
      );

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('ถูกจำกัดสิทธิ์เฉพาะงานคอนเสิร์ตที่ได้รับมอบหมาย');
    });

    it('rejects access to event B when scope cookie is omitted (Fail-Closed)', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      // No scanner_event_scope cookie sent at all
      const cookieHeader = `scanner_device_id=${boundDeviceId}`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId: eventB, scannerId },
      );

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('ไม่พบคุกกี้หรือข้อมูลขอบเขตงานคอนเสิร์ต');
    });

    it('rejects access to event B when scope cookie signature is tampered/invalid', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      // Tampered signature
      const cookieHeader = `scanner_event_scope=${eventB}.invalid-forged-signature; scanner_device_id=${boundDeviceId}`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId: eventB, scannerId },
      );

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('ลายเซ็นขอบเขตงานคอนเสิร์ตไม่ถูกต้อง');
    });

    it('enforces server-side session scope from database even if cookie is deleted', async () => {
      const testToken = 'valid-session-token-12345';
      const mockPool = {
        query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
          if (sql.includes('SELECT "eventId" FROM scanner_session_scopes')) {
            expect(params).toEqual([testToken]);
            // Server database says this session is bound to event A!
            return Promise.resolve({
              rowCount: 1,
              rows: [{ eventId: eventA }],
            });
          }
          return Promise.resolve({ rowCount: 0, rows: [] });
        }),
      } as unknown as Pool;

      // Client deleted scanner_event_scope cookie, sending only ticket.session_token
      const cookieHeader = `ticket.session_token=${testToken}.some-sig; scanner_device_id=${boundDeviceId}`;

      // Requesting event B should be blocked because server-side scope is event A!
      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId: eventB, scannerId },
      );

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('ถูกจำกัดสิทธิ์เฉพาะงานคอนเสิร์ตที่ได้รับมอบหมาย');
    });

    it('resolveScannerSessionScope reads scope from server database when cookie is deleted', async () => {
      const testToken = 'valid-token-scope-lookup';
      const mockPool = {
        query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
          if (sql.includes('SELECT "eventId" FROM scanner_session_scopes')) {
            expect(params).toEqual([testToken]);
            return Promise.resolve({
              rowCount: 1,
              rows: [{ eventId: eventA }],
            });
          }
          return Promise.resolve({ rowCount: 0, rows: [] });
        }),
      } as unknown as Pool;

      // Deleted scanner_event_scope cookie, only session token sent
      const cookieHeader = `ticket.session_token=${testToken}.sig`;
      const resolution = await resolveScannerSessionScope(mockPool, cookieHeader, testSecret);
      expect(resolution).toEqual({ status: 'scoped', eventId: eventA });

      const resolved = await resolveScannerSessionScopedEventId(mockPool, cookieHeader, testSecret);
      expect(resolved).toBe(eventA);
    });

    it('resolveScannerSessionScope falls back to signed cookie when no server record exists', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const signedScope = signScannerEventScopeCookie(eventA, testSecret);
      const cookieHeader = `scanner_event_scope=${signedScope}`;
      const resolution = await resolveScannerSessionScope(mockPool, cookieHeader, testSecret);
      expect(resolution).toEqual({ status: 'scoped', eventId: eventA });

      const resolved = await resolveScannerSessionScopedEventId(mockPool, cookieHeader, testSecret);
      expect(resolved).toBe(eventA);
    });

    it('resolveScannerSessionScope returns error with 403 when signature is invalid', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const cookieHeader = `scanner_event_scope=${eventA}.tampered-signature`;
      const resolution = await resolveScannerSessionScope(mockPool, cookieHeader, testSecret);
      expect(resolution.status).toBe('error');
      if (resolution.status === 'error') {
        expect(resolution.statusCode).toBe(403);
        expect(resolution.reason).toContain('ลายเซ็นขอบเขตงานคอนเสิร์ตไม่ถูกต้องหรือถูกดัดแปลง');
      }

      await expect(
        resolveScannerSessionScopedEventId(mockPool, cookieHeader, testSecret),
      ).rejects.toThrow('ลายเซ็นขอบเขตงานคอนเสิร์ตไม่ถูกต้องหรือถูกดัดแปลง');
    });

    it('resolveScannerSessionScope returns error with 500 when DB query throws error (does NOT swallow error)', async () => {
      const testToken = 'valid-session-db-crash';
      const mockPool = {
        query: vi.fn().mockRejectedValue(new Error('PostgreSQL connection timeout')),
      } as unknown as Pool;

      const cookieHeader = `ticket.session_token=${testToken}.sig`;
      const resolution = await resolveScannerSessionScope(mockPool, cookieHeader, testSecret);
      expect(resolution.status).toBe('error');
      if (resolution.status === 'error') {
        expect(resolution.statusCode).toBe(500);
        expect(resolution.reason).toContain('เกิดข้อผิดพลาดในการตรวจสอบขอบเขตงานคอนเสิร์ต');
      }

      await expect(
        resolveScannerSessionScopedEventId(mockPool, cookieHeader, testSecret),
      ).rejects.toThrow('เกิดข้อผิดพลาดในการตรวจสอบขอบเขตงานคอนเสิร์ต');
    });

    it('resolveScannerSessionScope returns error with 500 when table does not exist (PostgreSQL error 42P01)', async () => {
      const testToken = 'valid-session-table-missing';
      const err42P01 = Object.assign(new Error('relation "scanner_session_scopes" does not exist'), { code: '42P01' });

      const mockPool = {
        query: vi.fn().mockRejectedValue(err42P01),
      } as unknown as Pool;

      const cookieHeader = `ticket.session_token=${testToken}.sig`;
      const resolution = await resolveScannerSessionScope(mockPool, cookieHeader, testSecret);
      expect(resolution.status).toBe('error');
      if (resolution.status === 'error') {
        expect(resolution.statusCode).toBe(500);
        expect(resolution.reason).toContain('เกิดข้อผิดพลาดในการตรวจสอบขอบเขตงานคอนเสิร์ต');
      }

      await expect(
        resolveScannerSessionScopedEventId(mockPool, cookieHeader, testSecret),
      ).rejects.toThrow('เกิดข้อผิดพลาดในการตรวจสอบขอบเขตงานคอนเสิร์ต');
    });

    it('resolveScannerSessionScope returns unscoped when neither DB record nor cookie scope exists', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const cookieHeader = 'ticket.session_token=unscoped-session.sig';
      const resolution = await resolveScannerSessionScope(mockPool, cookieHeader, testSecret);
      expect(resolution).toEqual({ status: 'unscoped' });

      const resolved = await resolveScannerSessionScopedEventId(mockPool, cookieHeader, testSecret);
      expect(resolved).toBeNull();
    });
  });
});
