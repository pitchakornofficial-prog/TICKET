import { describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import {
  requestGuestOtp,
  verifyGuestOtp,
  hashOtpCode,
  extractClientIp,
  OTP_IP_MAX_REQUESTS_IN_WINDOW,
} from '../../src/server/guest-otp';
import { clearCapturedEmails, getCapturedEmails } from '../../src/server/email';

describe('Issue #16: Guest OTP IP Rate Limiting and Hashed Storage', () => {
  interface MockDbState {
    otps: Array<{
      id: string;
      email: string;
      purpose: string;
      code: string;
      requestId: string;
      expiresAt: Date;
      consumedAt: Date | null;
      createdAt: Date;
    }>;
    tracking: Map<string, {
      key: string;
      requestCount: number;
      lastRequestAt: Date;
      failCount: number;
      lastFailAt: Date | null;
      blockedUntil: Date | null;
    }>;
  }

  function createMockPool(): { pool: Pool; state: MockDbState } {
    const state: MockDbState = {
      otps: [],
      tracking: new Map(),
    };

    const mockClient = {
      query: async (sql: string, params: unknown[]) => {
        // Handle SELECT on tracking
        if (sql.includes('SELECT "requestCount", "lastRequestAt"') || sql.includes('SELECT "failCount"')) {
          const key = params[0] as string;
          const entry = state.tracking.get(key);
          if (entry) {
            return {
              rowCount: 1,
              rows: [{
                key: entry.key,
                requestCount: entry.requestCount,
                lastRequestAt: entry.lastRequestAt,
                failCount: entry.failCount,
                lastFailAt: entry.lastFailAt,
                blockedUntil: entry.blockedUntil,
              }],
            };
          }
          return { rowCount: 0, rows: [] };
        }

        // Handle INSERT into guest_otp_tracking
        if (sql.includes('INSERT INTO guest_otp_tracking')) {
          const key = params[0] as string;
          const lastRequestAt = params[1] as Date;
          state.tracking.set(key, {
            key,
            requestCount: 1,
            lastRequestAt,
            failCount: 0,
            lastFailAt: null,
            blockedUntil: null,
          });
          return { rowCount: 1, rows: [] };
        }

        // Handle UPDATE guest_otp_tracking
        if (sql.includes('UPDATE guest_otp_tracking')) {
          if (sql.includes('SET "requestCount" = $1, "lastRequestAt" = $2')) {
            const count = params[0] as number;
            const lastRequestAt = params[1] as Date;
            const key = params[2] as string;
            const old = state.tracking.get(key);
            state.tracking.set(key, {
              key,
              requestCount: count,
              lastRequestAt,
              failCount: old?.failCount ?? 0,
              lastFailAt: old?.lastFailAt ?? null,
              blockedUntil: old?.blockedUntil ?? null,
            });
          } else if (sql.includes('SET "failCount" = $1')) {
            const failCount = params[0] as number;
            const lastFailAt = params[1] as Date;
            const blockedUntil = params[2] as Date | null;
            const key = params[3] as string;
            const old = state.tracking.get(key);
            state.tracking.set(key, {
              key,
              requestCount: old?.requestCount ?? 0,
              lastRequestAt: old?.lastRequestAt ?? new Date(),
              failCount,
              lastFailAt,
              blockedUntil,
            });
          } else if (sql.includes('SET "failCount" = 0')) {
            const key = params[0] as string;
            const old = state.tracking.get(key);
            if (old) {
              old.failCount = 0;
              old.lastFailAt = null;
              old.blockedUntil = null;
            }
          }
          return { rowCount: 1, rows: [] };
        }

        // Handle UPDATE guest_otp invalidating active OTPs
        if (sql.includes('UPDATE guest_otp SET "consumedAt" = $1 WHERE email = $2')) {
          const now = params[0] as Date;
          const email = params[1] as string;
          const purpose = params[2] as string;
          for (const otp of state.otps) {
            if (otp.email === email && otp.purpose === purpose && !otp.consumedAt) {
              otp.consumedAt = now;
            }
          }
          return { rowCount: 1, rows: [] };
        }

        // Handle INSERT into guest_otp
        if (sql.includes('INSERT INTO guest_otp')) {
          const id = params[0] as string;
          const email = params[1] as string;
          const purpose = params[2] as string;
          const code = params[3] as string;
          const requestId = params[4] as string;
          const expiresAt = params[5] as Date;
          const createdAt = params[6] as Date;
          state.otps.push({
            id,
            email,
            purpose,
            code,
            requestId,
            expiresAt,
            consumedAt: null,
            createdAt,
          });
          return { rowCount: 1, rows: [] };
        }

        // Handle SELECT id, code, "requestId" FROM guest_otp
        if (sql.includes('SELECT id, code') && sql.includes('FROM guest_otp')) {
          const requestId = params[0] as string;
          const email = params[1] as string;
          const purpose = params[2] as string;
          const found = state.otps.find(
            o => o.requestId === requestId && o.email === email && o.purpose === purpose,
          );
          if (found) {
            return {
              rowCount: 1,
              rows: [{
                id: found.id,
                code: found.code,
                requestId: found.requestId,
                expiresAt: found.expiresAt,
                consumedAt: found.consumedAt,
              }],
            };
          }
          return { rowCount: 0, rows: [] };
        }

        // Handle UPDATE guest_otp SET "consumedAt" mark consumed
        if (sql.includes('UPDATE guest_otp SET "consumedAt" = $1 WHERE id = $2 AND "consumedAt" IS NULL')) {
          const now = params[0] as Date;
          const id = params[1] as string;
          const found = state.otps.find(o => o.id === id && !o.consumedAt);
          if (found) {
            found.consumedAt = now;
            return { rowCount: 1, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        }

        // Handle INSERT INTO guest_verified_sessions
        if (sql.includes('INSERT INTO guest_verified_sessions')) {
          return { rowCount: 1, rows: [] };
        }

        if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK') || sql.includes('CREATE TABLE')) {
          return { rowCount: 0, rows: [] };
        }

        return { rowCount: 0, rows: [] };
      },
      release: () => {},
    };

    return {
      pool: {
        connect: async () => mockClient as unknown as PoolClient,
        query: mockClient.query,
      } as unknown as Pool,
      state,
    };
  }

  describe('1. Hashed OTP storage in database', () => {
    it('stores HMAC-SHA256 hash (64 hex characters) in guest_otp.code, not plaintext', async () => {
      clearCapturedEmails();
      const { pool, state } = createMockPool();

      const result = await requestGuestOtp(pool, {
        buyer: { name: 'นายทดสอบ แฮช', email: 'test_hash@example.com', phone: '0812345678' },
        purpose: 'checkout',
      });

      expect(result.success).toBe(true);
      expect(state.otps).toHaveLength(1);

      const storedOtp = state.otps[0];
      // Verify code is 64-char hex hash, NOT a 6-digit plaintext number
      expect(storedOtp.code).toHaveLength(64);
      expect(storedOtp.code).toMatch(/^[0-9a-f]{64}$/);

      // Verify that the sent email contains the real 6-digit code
      const emails = getCapturedEmails();
      expect(emails).toHaveLength(1);
      const emailCode = emails[0]?.text?.match(/\b(\d{6})\b/)?.[1];
      expect(emailCode).toBeDefined();

      // Verify that hashing the sent code with requestId matches the stored hash
      const computedHash = hashOtpCode(emailCode ?? '', storedOtp.requestId);
      expect(storedOtp.code).toBe(computedHash);
    });

    it('verifies successfully with correct 6-digit code using hash verification', async () => {
      clearCapturedEmails();
      const { pool } = createMockPool();

      const reqRes = await requestGuestOtp(pool, {
        buyer: { name: 'นายยืนยัน แฮช', email: 'verify_hash@example.com', phone: '0812345678' },
        purpose: 'checkout',
      });

      const emailCode = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/)?.[1] ?? '';
      expect(emailCode).toBeTruthy();

      const verifyRes = await verifyGuestOtp(pool, {
        email: 'verify_hash@example.com',
        code: emailCode,
        requestId: reqRes.requestId ?? '',
        purpose: 'checkout',
        buyer: { name: 'นายยืนยัน แฮช', email: 'verify_hash@example.com', phone: '0812345678' },
      });

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.verifiedToken).toBeDefined();
    });

    it('rejects verification with wrong code and locks out after 5 attempts', async () => {
      clearCapturedEmails();
      const { pool } = createMockPool();

      const reqRes = await requestGuestOtp(pool, {
        buyer: { name: 'นายทดสอบ ล็อก', email: 'lockout_test@example.com', phone: '0812345678' },
        purpose: 'checkout',
      });

      // 4 wrong attempts
      for (let i = 0; i < 4; i++) {
        const res = await verifyGuestOtp(pool, {
          email: 'lockout_test@example.com',
          code: '000000',
          requestId: reqRes.requestId ?? '',
          purpose: 'checkout',
          buyer: { name: 'นายทดสอบ ล็อก', email: 'lockout_test@example.com', phone: '0812345678' },
        });
        expect(res.success).toBe(false);
        expect(res.code).toBe('INVALID_CODE');
      }

      // 5th wrong attempt triggers lockout
      const fifthRes = await verifyGuestOtp(pool, {
        email: 'lockout_test@example.com',
        code: '000000',
        requestId: reqRes.requestId ?? '',
        purpose: 'checkout',
        buyer: { name: 'นายทดสอบ ล็อก', email: 'lockout_test@example.com', phone: '0812345678' },
      });
      expect(fifthRes.success).toBe(false);
      expect(fifthRes.code).toBe('BLOCKED');
    });

    it('supports backward compatibility with legacy plaintext OTP code', async () => {
      const { pool, state } = createMockPool();
      const now = new Date();

      // Simulate a legacy plaintext OTP row in DB
      state.otps.push({
        id: 'legacy-id-1',
        email: 'legacy@example.com',
        purpose: 'checkout',
        code: '654321', // 6 digits plaintext
        requestId: 'legacy-req-1',
        expiresAt: new Date(now.getTime() + 300000),
        consumedAt: null,
        createdAt: now,
      });

      const verifyRes = await verifyGuestOtp(pool, {
        email: 'legacy@example.com',
        code: '654321',
        requestId: 'legacy-req-1',
        purpose: 'checkout',
        buyer: { name: 'นายแบบดั้งเดิม', email: 'legacy@example.com', phone: '0812345678' },
        now,
      });

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.verifiedToken).toBeDefined();
    });
  });

  describe('2. IP-level rate limiting on OTP requests', () => {
    it('allows up to 20 OTP requests per 15 minutes from the same IP across different emails', async () => {
      const { pool } = createMockPool();
      const testIp = '198.51.100.42';
      const t0 = new Date('2026-12-10T10:00:00.000Z');

      // Request 20 OTPs for 20 DIFFERENT email addresses from the same IP
      for (let i = 1; i <= OTP_IP_MAX_REQUESTS_IN_WINDOW; i++) {
        const res = await requestGuestOtp(pool, {
          buyer: { name: `Buyer ${i}`, email: `buyer_${i}@test.invalid`, phone: '0812345678' },
          purpose: 'checkout',
          clientIp: testIp,
          now: new Date(t0.getTime() + i * 1000),
        });
        expect(res.success).toBe(true);
      }

      // The 21st request from the same IP should be blocked with RATE_LIMITED
      const blockedRes = await requestGuestOtp(pool, {
        buyer: { name: 'Buyer 21', email: 'buyer_21@test.invalid', phone: '0812345678' },
        purpose: 'checkout',
        clientIp: testIp,
        now: new Date(t0.getTime() + 21 * 1000),
      });

      expect(blockedRes.success).toBe(false);
      expect(blockedRes.code).toBe('RATE_LIMITED');
      expect(blockedRes.error).toContain('IP ของท่านถี่เกินกำหนด');
    });

    it('allows a different IP address even if the first IP is rate-limited', async () => {
      const { pool } = createMockPool();
      const ipA = '198.51.100.50';
      const ipB = '198.51.100.99';
      const t0 = new Date('2026-12-10T10:00:00.000Z');

      // Exhaust IP A quota
      for (let i = 1; i <= OTP_IP_MAX_REQUESTS_IN_WINDOW; i++) {
        await requestGuestOtp(pool, {
          buyer: { name: `Buyer ${i}`, email: `user_ipa_${i}@test.invalid`, phone: '0812345678' },
          purpose: 'checkout',
          clientIp: ipA,
          now: t0,
        });
      }

      // Request from IP B should succeed
      const ipBRes = await requestGuestOtp(pool, {
        buyer: { name: 'Buyer IP B', email: 'user_ipb@test.invalid', phone: '0812345678' },
        purpose: 'checkout',
        clientIp: ipB,
        now: t0,
      });

      expect(ipBRes.success).toBe(true);
      expect(ipBRes.requestId).toBeDefined();
    });

    it('resets IP request counter after the 15-minute window expires', async () => {
      const { pool } = createMockPool();
      const testIp = '198.51.100.77';
      const t0 = new Date('2026-12-10T10:00:00.000Z');

      // Exhaust IP quota
      for (let i = 1; i <= OTP_IP_MAX_REQUESTS_IN_WINDOW; i++) {
        await requestGuestOtp(pool, {
          buyer: { name: `Buyer ${i}`, email: `user_${i}@test.invalid`, phone: '0812345678' },
          purpose: 'checkout',
          clientIp: testIp,
          now: t0,
        });
      }

      // 16 minutes later (> 15-minute window)
      const afterWindow = new Date(t0.getTime() + 16 * 60 * 1000);
      const allowedRes = await requestGuestOtp(pool, {
        buyer: { name: 'Buyer Fresh', email: 'fresh_window@test.invalid', phone: '0812345678' },
        purpose: 'checkout',
        clientIp: testIp,
        now: afterWindow,
      });

      expect(allowedRes.success).toBe(true);
      expect(allowedRes.requestId).toBeDefined();
    });
  });

  describe('3. extractClientIp header helper', () => {
    it('extracts rightmost trusted-proxy-appended IP in default alb mode and ignores spoofed cf-connecting-ip / leftmost x-forwarded-for', () => {
      const req = new Request('http://localhost/api/test', {
        headers: {
          'cf-connecting-ip': '198.51.100.1',
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
        },
      });
      expect(extractClientIp(req)).toBe('150.172.238.178');
    });

    it('supports multi-hop trustedProxyHops when multiple trusted proxies append to x-forwarded-for', () => {
      const req = new Request('http://localhost/api/test', {
        headers: {
          'x-forwarded-for': '198.51.100.99, 203.0.113.195, 10.0.0.5',
        },
      });
      expect(extractClientIp(req, { mode: 'alb', trustedProxyHops: 2 })).toBe('203.0.113.195');
    });

    it('reads cf-connecting-ip only when mode is cloudflare', () => {
      const req = new Request('http://localhost/api/test', {
        headers: {
          'cf-connecting-ip': '198.51.100.42',
          'x-forwarded-for': '203.0.113.195, 150.172.238.178',
        },
      });
      expect(extractClientIp(req, { mode: 'cloudflare' })).toBe('198.51.100.42');
    });

    it('ignores invalid non-IP header values and falls back safely', () => {
      const req = new Request('http://localhost/api/test', {
        headers: {
          'x-forwarded-for': 'spoofed-not-an-ip',
          'x-real-ip': '198.51.100.88',
        },
      });
      expect(extractClientIp(req)).toBe('198.51.100.88');
    });

    it('defaults to 127.0.0.1 when no valid proxy headers are present', () => {
      const req = new Request('http://localhost/api/test');
      expect(extractClientIp(req)).toBe('127.0.0.1');
    });
  });
});
