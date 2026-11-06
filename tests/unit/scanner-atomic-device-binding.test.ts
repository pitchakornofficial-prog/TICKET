import { describe, expect, it, vi } from 'vitest';
import {
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
});
