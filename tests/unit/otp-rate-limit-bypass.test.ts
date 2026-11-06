import { describe, expect, it } from 'vitest';
import { POST as requestOtpRoute } from '../../src/app/api/public/checkout/request-otp/route';
import { POST as verifyOtpRoute } from '../../src/app/api/public/checkout/verify-otp/route';
import {
  requestGuestOtp,
  verifyGuestOtp,
  ALLOWED_OTP_PURPOSES,
} from '../../src/server/guest-otp';
import type { Pool } from 'pg';

describe('Issue #6: OTP Rate Limit Bypass Prevention & Allowlist Enforcement', () => {
  function createMockPool() {
    const store = new Map<string, { requestCount: number; lastRequestAt: Date; failCount: number; lastFailAt: Date | null; blockedUntil: Date | null }>();

    const client = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes('SELECT "requestCount"')) {
          const key = params[0] as string;
          const entry = store.get(key);
          if (entry) {
            return {
              rowCount: 1,
              rows: [{
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
        if (sql.includes('INSERT INTO guest_otp_tracking')) {
          const key = params[0] as string;
          const lastRequestAt = params[1] as Date;
          store.set(key, { requestCount: 1, lastRequestAt, failCount: 0, lastFailAt: null, blockedUntil: null });
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes('UPDATE guest_otp_tracking')) {
          if (sql.includes('SET "requestCount" = $1, "lastRequestAt" = $2\n         WHERE key = $3')) {
            const count = params[0] as number;
            const lastRequestAt = params[1] as Date;
            const key = params[2] as string;
            const old = store.get(key);
            store.set(key, { ...(old || { failCount: 0, lastFailAt: null, blockedUntil: null }), requestCount: count, lastRequestAt });
          } else {
            const count = params[0] as number;
            const lastRequestAt = params[1] as Date;
            const key = params[5] as string;
            const old = store.get(key);
            store.set(key, { ...(old || { failCount: 0, lastFailAt: null, blockedUntil: null }), requestCount: count, lastRequestAt });
          }
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes('CREATE TABLE')) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    return {
      pool: {
        connect: async () => ({ ...client, release: () => {} }),
        query: client.query,
      } as unknown as Pool,
      store,
    };
  }

  describe('1. Endpoint-level Server Enforced Purpose', () => {
    it('rejects tampered purpose in /api/public/checkout/request-otp with 400 Bad Request', async () => {
      const req = new Request('http://localhost:3000/api/public/checkout/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: { name: 'Attacker', email: 'attacker@ticket.invalid', phone: '0812345678' },
          purpose: 'tampered_purpose',
        }),
      });

      const res = await requestOtpRoute(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('วัตถุประสงค์ (purpose) ไม่ถูกต้องสำหรับขั้นตอนนี้');
    });

    it('rejects tampered purpose in /api/public/checkout/verify-otp with 400 Bad Request', async () => {
      const req = new Request('http://localhost:3000/api/public/checkout/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: { name: 'Attacker', email: 'attacker@ticket.invalid', phone: '0812345678' },
          email: 'attacker@ticket.invalid',
          code: '123456',
          requestId: 'some-req-id',
          purpose: 'tampered_purpose',
        }),
      });

      const res = await verifyOtpRoute(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('วัตถุประสงค์ (purpose) ไม่ถูกต้องสำหรับขั้นตอนนี้');
    });
  });

  describe('2. Purpose Allowlist & Validation in guest-otp', () => {
    it('defines strictly allowed OTP purposes', () => {
      expect(ALLOWED_OTP_PURPOSES).toEqual(['checkout', 'order_lookup']);
    });

    it('rejects requestGuestOtp when purpose is not in allowlist', async () => {
      const { pool } = createMockPool();
      const buyer = { name: 'Test', email: 'test@ticket.invalid', phone: '0812345678' };

      const res = await requestGuestOtp(pool, {
        buyer,
        purpose: 'arbitrary_bypass_string',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('MISSING_FIELDS');
      expect(res.error).toContain('วัตถุประสงค์ (purpose) ในการขอรหัส OTP ไม่ถูกต้อง');
    });

    it('rejects verifyGuestOtp when purpose is not in allowlist', async () => {
      const { pool } = createMockPool();
      const buyer = { name: 'Test', email: 'test@ticket.invalid', phone: '0812345678' };

      const res = await verifyGuestOtp(pool, {
        email: buyer.email,
        code: '123456',
        requestId: 'req-1',
        buyer,
        purpose: 'arbitrary_bypass_string',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_CODE');
      expect(res.error).toContain('วัตถุประสงค์ (purpose) ในการตรวจสอบรหัส OTP ไม่ถูกต้อง');
    });
  });

  describe('3. Global Email Cooldown & Rate Limit Ceiling', () => {
    it('enforces 60-second cooldown across purposes for the same email', async () => {
      const { pool } = createMockPool();
      const buyer = { name: 'User', email: 'user@ticket.invalid', phone: '0812345678' };
      const baseTime = new Date('2026-11-01T10:00:00.000Z');

      // Request 1: purpose checkout -> succeeds
      const req1 = await requestGuestOtp(pool, { buyer, purpose: 'checkout', now: baseTime });
      expect(req1.success).toBe(true);

      // Request 2 in same second with purpose order_lookup -> BLOCKED by global cooldown!
      const req2DifferentPurpose = await requestGuestOtp(pool, {
        buyer,
        purpose: 'order_lookup',
        now: baseTime,
      });
      expect(req2DifferentPurpose.success).toBe(false);
      expect(req2DifferentPurpose.code).toBe('COOLDOWN');
      expect(req2DifferentPurpose.error).toContain('กรุณารอ 60 วินาที');
    });

    it('enforces 15-minute global ceiling (max 5 requests) across purposes for the same email', async () => {
      const { pool } = createMockPool();
      const buyer = { name: 'User', email: 'ceiling@ticket.invalid', phone: '0812345678' };
      let time = new Date('2026-11-01T10:00:00.000Z');

      // Alternating requests across 5 intervals (+70s each):
      // Req 1: checkout
      const r1 = await requestGuestOtp(pool, { buyer, purpose: 'checkout', now: time });
      expect(r1.success).toBe(true);

      // Req 2: order_lookup
      time = new Date(time.getTime() + 70000);
      const r2 = await requestGuestOtp(pool, { buyer, purpose: 'order_lookup', now: time });
      expect(r2.success).toBe(true);

      // Req 3: checkout
      time = new Date(time.getTime() + 70000);
      const r3 = await requestGuestOtp(pool, { buyer, purpose: 'checkout', now: time });
      expect(r3.success).toBe(true);

      // Req 4: order_lookup
      time = new Date(time.getTime() + 70000);
      const r4 = await requestGuestOtp(pool, { buyer, purpose: 'order_lookup', now: time });
      expect(r4.success).toBe(true);

      // Req 5: checkout (5th request total)
      time = new Date(time.getTime() + 70000);
      const r5 = await requestGuestOtp(pool, { buyer, purpose: 'checkout', now: time });
      expect(r5.success).toBe(true);

      // Req 6: order_lookup (6th request total within 15 minutes) -> BLOCKED by global RATE_LIMITED!
      time = new Date(time.getTime() + 70000);
      const r6 = await requestGuestOtp(pool, { buyer, purpose: 'order_lookup', now: time });
      expect(r6.success).toBe(false);
      expect(r6.code).toBe('RATE_LIMITED');
      expect(r6.error).toContain('คุณขอรหัส OTP เกินจำนวนที่กำหนด (สูงสุด 5 ครั้งใน 15 นาที)');
    });
  });
});
