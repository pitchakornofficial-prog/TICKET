import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  extractSessionTokenFromCookie,
  getScannerEventScopeCookie,
  resolveScannerSessionScope,
  resolveScannerSessionScopedEventId,
  signScannerEventScopeCookie,
  verifyScannerSessionEventScope,
} from '../../src/server/scanner-scope';

const testSecret = 'test-better-auth-secret-key-32chars!!';

describe('Scanner Scope Session Binding and Expiration (Security Item 17)', () => {
  const eventId = 'event-rock-fest-2026';
  const sessionToken = 'session-token-scanner-user-12345';
  const validExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // +8h

  describe('signScannerEventScopeCookie', () => {
    it('signs legacy 2-part cookie when sessionToken or expiresAt is omitted', () => {
      const signed = signScannerEventScopeCookie(eventId, testSecret);
      const parts = signed.split('.');
      expect(parts.length).toBe(2);
      expect(parts[0]).toBe(eventId);
      expect(parts[1]).toBeTruthy();
    });

    it('signs 4-part cookie containing eventId, sessionToken, and expiresAt timestamp', () => {
      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });

      const parts = signed.split('.');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe(eventId);
      expect(parts[1]).toBe(sessionToken);
      expect(parts[2]).toBe(String(validExpiresAt.getTime()));
      expect(parts[3]).toBeTruthy();
    });

    it('handles eventId with dots correctly', () => {
      const dottedEventId = 'event.summer.fest.2026';
      const signed = signScannerEventScopeCookie(dottedEventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });

      const extracted = getScannerEventScopeCookie(
        `scanner_event_scope=${signed}`,
        testSecret,
        sessionToken,
      );
      expect(extracted).toBe(dottedEventId);
    });
  });

  describe('getScannerEventScopeCookie', () => {
    it('verifies successfully when sessionToken matches and cookie is not expired', () => {
      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });

      const cookieHeader = `ticket.session_token=${sessionToken}; scanner_event_scope=${signed}`;
      const result = getScannerEventScopeCookie(cookieHeader, testSecret, sessionToken);
      expect(result).toBe(eventId);
    });

    it('verifies successfully when expectedSessionToken is omitted but present in cookie header', () => {
      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });

      const cookieHeader = `ticket.session_token=${sessionToken}; scanner_event_scope=${signed}`;
      const result = getScannerEventScopeCookie(cookieHeader, testSecret);
      expect(result).toBe(eventId);
    });

    it('rejects (returns null) when session token does not match (session hijacking / cookie theft)', () => {
      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });

      // Attacker sends stolen scanner_event_scope with their own session token
      const attackerSessionToken = 'attacker-stolen-session-999';
      const cookieHeader = `ticket.session_token=${attackerSessionToken}; scanner_event_scope=${signed}`;

      const result = getScannerEventScopeCookie(cookieHeader, testSecret, attackerSessionToken);
      expect(result).toBeNull();
    });

    it('rejects (returns null) when no session token is provided in request', () => {
      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });

      // Request has scanner_event_scope but no ticket.session_token
      const cookieHeader = `scanner_event_scope=${signed}`;
      const result = getScannerEventScopeCookie(cookieHeader, testSecret);
      expect(result).toBeNull();
    });

    it('rejects (returns null) when cookie has expired', () => {
      const expiredAt = new Date(Date.now() - 1000); // 1 second ago
      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: expiredAt,
      });

      const cookieHeader = `ticket.session_token=${sessionToken}; scanner_event_scope=${signed}`;
      const result = getScannerEventScopeCookie(cookieHeader, testSecret, sessionToken);
      expect(result).toBeNull();
    });

    it('rejects (returns null) when signature is tampered (timingSafeEqual)', () => {
      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });
      const parts = signed.split('.');
      parts[3] = 'tamperedSignatureWithWrongBase64Chars44len==';
      const tamperedCookie = parts.join('.');

      const cookieHeader = `ticket.session_token=${sessionToken}; scanner_event_scope=${tamperedCookie}`;
      const result = getScannerEventScopeCookie(cookieHeader, testSecret, sessionToken);
      expect(result).toBeNull();
    });

    it('rejects (returns null) when payload parts are modified', () => {
      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });
      const parts = signed.split('.');
      parts[0] = 'event-other-festival'; // modify eventId
      const tamperedCookie = parts.join('.');

      const cookieHeader = `ticket.session_token=${sessionToken}; scanner_event_scope=${tamperedCookie}`;
      const result = getScannerEventScopeCookie(cookieHeader, testSecret, sessionToken);
      expect(result).toBeNull();
    });

    it('preserves backward compatibility for legacy 2-part cookies', () => {
      const legacySigned = signScannerEventScopeCookie(eventId, testSecret);
      const cookieHeader = `scanner_event_scope=${legacySigned}`;

      const result = getScannerEventScopeCookie(cookieHeader, testSecret);
      expect(result).toBe(eventId);
    });

    it('extracts sessionToken properly from both cookie name variants and strips trailing signatures', () => {
      const plainCookie = 'ticket.session_token=raw-token-123.sigXYZ; other=1';
      expect(extractSessionTokenFromCookie(plainCookie)).toBe('raw-token-123');

      const secureCookie = '__Secure-ticket.session_token=secure-token-456.sigABC';
      expect(extractSessionTokenFromCookie(secureCookie)).toBe('secure-token-456');

      const noDotCookie = 'ticket.session_token=nodotsessiontoken';
      expect(extractSessionTokenFromCookie(noDotCookie)).toBe('nodotsessiontoken');

      expect(extractSessionTokenFromCookie(null)).toBeNull();
      expect(extractSessionTokenFromCookie('')).toBeNull();
    });

    it('rejects legacy 2-part cookie when signature is invalid', () => {
      const cookieHeader = `scanner_event_scope=${eventId}.invalidSignatureHere`;
      const result = getScannerEventScopeCookie(cookieHeader, testSecret);
      expect(result).toBeNull();
    });
  });

  describe('resolveScannerSessionScope and resolveScannerSessionScopedEventId', () => {
    it('resolves scoped eventId when session-bound cookie matches session token', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });
      const cookieHeader = `ticket.session_token=${sessionToken}; scanner_event_scope=${signed}`;

      const resolution = await resolveScannerSessionScope(mockPool, cookieHeader, testSecret);
      expect(resolution.status).toBe('scoped');
      if (resolution.status === 'scoped') {
        expect(resolution.eventId).toBe(eventId);
      }

      const scopedEventId = await resolveScannerSessionScopedEventId(
        mockPool,
        cookieHeader,
        testSecret,
      );
      expect(scopedEventId).toBe(eventId);
    });

    it('returns 403 error when session token does not match bound cookie', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });
      const foreignSession = 'foreign-scanner-session-xyz';
      const cookieHeader = `ticket.session_token=${foreignSession}; scanner_event_scope=${signed}`;

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

    it('returns 403 error when session-bound cookie is expired', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const expiredAt = new Date(Date.now() - 5000);
      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: expiredAt,
      });
      const cookieHeader = `ticket.session_token=${sessionToken}; scanner_event_scope=${signed}`;

      const resolution = await resolveScannerSessionScope(mockPool, cookieHeader, testSecret);
      expect(resolution.status).toBe('error');
      if (resolution.status === 'error') {
        expect(resolution.statusCode).toBe(403);
      }
    });
  });

  describe('verifyScannerSessionEventScope with session binding', () => {
    it('permits scanner when session-bound cookie matches session and target event', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });
      const cookieHeader = `ticket.session_token=${sessionToken}; scanner_event_scope=${signed}`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId },
      );

      expect(check.allowed).toBe(true);
    });

    it('denies scanner when session token does not match bound cookie', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const signed = signScannerEventScopeCookie(eventId, testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });
      const foreignSession = 'foreign-scanner-session-xyz';
      const cookieHeader = `ticket.session_token=${foreignSession}; scanner_event_scope=${signed}`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId },
      );

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('ลายเซ็นขอบเขตงานคอนเสิร์ตไม่ถูกต้องหรือถูกดัดแปลง');
    });

    it('denies scanner when cookie is bound to event A but target is event B', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      } as unknown as Pool;

      const signed = signScannerEventScopeCookie('event-A', testSecret, {
        sessionToken,
        expiresAt: validExpiresAt,
      });
      const cookieHeader = `ticket.session_token=${sessionToken}; scanner_event_scope=${signed}`;

      const check = await verifyScannerSessionEventScope(
        mockPool,
        'scanner',
        cookieHeader,
        testSecret,
        { eventId: 'event-B' },
      );

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('ไม่อนุญาต: เซสชันการสแกนนี้ถูกจำกัดสิทธิ์เฉพาะงานคอนเสิร์ตที่ได้รับมอบหมายเท่านั้น');
    });
  });
});
