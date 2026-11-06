import { describe, expect, it } from 'vitest';
import { verifyGuestOtp } from '../../src/server/guest-otp';
import type { Pool } from 'pg';

describe('Issue #7: OTP Verification Concurrency & Race Condition Prevention (AC-57, AC-59)', () => {
  function createMockConcurrencyPool() {
    const executedQueries: { sql: string; params?: unknown[] }[] = [];
    let isConsumed = false;
    let failCount = 0;
    let blockedUntil: Date | null = null;
    let lastFailAt: Date | null = null;

    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        executedQueries.push({ sql, params });

        if (sql.includes('SELECT "failCount"')) {
          return {
            rowCount: 1,
            rows: [{ failCount, lastFailAt, blockedUntil }],
          };
        }

        if (sql.includes('SELECT id, code, "expiresAt", "consumedAt" FROM guest_otp')) {
          return {
            rowCount: 1,
            rows: [{
              id: 'otp-uuid-1',
              code: '123456',
              expiresAt: new Date(Date.now() + 300000),
              consumedAt: isConsumed ? new Date() : null,
            }],
          };
        }

        if (sql.includes('UPDATE guest_otp SET "consumedAt"')) {
          if (sql.includes('AND "consumedAt" IS NULL')) {
            if (isConsumed) {
              return { rowCount: 0, rows: [] };
            }
            isConsumed = true;
            return { rowCount: 1, rows: [] };
          }
          isConsumed = true;
          return { rowCount: 1, rows: [] };
        }

        if (sql.includes('UPDATE guest_otp_tracking')) {
          if (sql.includes('"failCount" = $1')) {
            failCount = params[0] as number;
            lastFailAt = params[1] as Date;
            blockedUntil = (params[2] as Date) || null;
          }
          return { rowCount: 1, rows: [] };
        }

        if (sql.includes('INSERT INTO guest_verified_sessions')) {
          return { rowCount: 1, rows: [] };
        }

        if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
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
      executedQueries,
      getIsConsumed: () => isConsumed,
      setIsConsumed: (v: boolean) => { isConsumed = v; },
      getFailCount: () => failCount,
    };
  }

  describe('1. SQL Row-Locking & Atomic Condition Semantics', () => {
    it('uses FOR UPDATE row lock when querying guest_otp_tracking and guest_otp', async () => {
      const { pool, executedQueries } = createMockConcurrencyPool();
      const buyer = { name: 'สมชาย ใจดี', email: 'lock@ticket.invalid', phone: '0812345678' };

      const res = await verifyGuestOtp(pool, {
        email: buyer.email,
        code: '123456',
        requestId: 'req-uuid',
        buyer,
      });

      expect(res.success).toBe(true);

      const trackingQuery = executedQueries.find(q => q.sql.includes('SELECT "failCount"'));
      expect(trackingQuery).toBeDefined();
      expect(trackingQuery?.sql).toContain('FOR UPDATE');

      const otpQuery = executedQueries.find(q => q.sql.includes('SELECT id, code, "expiresAt", "consumedAt" FROM guest_otp'));
      expect(otpQuery).toBeDefined();
      expect(otpQuery?.sql).toContain('FOR UPDATE');

      const consumeQuery = executedQueries.find(q => q.sql.includes('UPDATE guest_otp SET "consumedAt"'));
      expect(consumeQuery).toBeDefined();
      expect(consumeQuery?.sql).toContain('WHERE id = $2 AND "consumedAt" IS NULL');
    });

    it('rejects with REPLAY when conditional atomic update returns 0 rows', async () => {
      const { pool, setIsConsumed } = createMockConcurrencyPool();
      const buyer = { name: 'สมชาย ใจดี', email: 'replay@ticket.invalid', phone: '0812345678' };

      // Set consumed before query to simulate concurrent consumption between check and update
      setIsConsumed(true);

      const res = await verifyGuestOtp(pool, {
        email: buyer.email,
        code: '123456',
        requestId: 'req-uuid',
        buyer,
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('REPLAY');
      expect(res.error).toContain('รหัส OTP นี้ถูกใช้งานไปแล้ว');
    });
  });

  describe('2. Concurrent Single-Use Replay Protection', () => {
    it('allows only the first verification and rejects the second with REPLAY', async () => {
      const { pool } = createMockConcurrencyPool();
      const buyer = { name: 'สมชาย ใจดี', email: 'first@ticket.invalid', phone: '0812345678' };

      // First verification succeeds
      const res1 = await verifyGuestOtp(pool, {
        email: buyer.email,
        code: '123456',
        requestId: 'req-uuid',
        buyer,
      });
      expect(res1.success).toBe(true);
      expect(res1.verifiedToken).toBeDefined();

      // Second verification immediately fails with REPLAY
      const res2 = await verifyGuestOtp(pool, {
        email: buyer.email,
        code: '123456',
        requestId: 'req-uuid',
        buyer,
      });
      expect(res2.success).toBe(false);
      expect(res2.code).toBe('REPLAY');
    });
  });

  describe('3. Concurrency Lockout Accumulation', () => {
    it('correctly increments failCount and locks out on 5th failure', async () => {
      const { pool, getFailCount } = createMockConcurrencyPool();
      const buyer = { name: 'สมชาย ใจดี', email: 'fail@ticket.invalid', phone: '0812345678' };

      for (let i = 1; i <= 4; i++) {
        const res = await verifyGuestOtp(pool, {
          email: buyer.email,
          code: `00000${i}`,
          requestId: 'req-uuid',
          buyer,
        });
        expect(res.success).toBe(false);
        expect(res.code).toBe('INVALID_CODE');
        expect(getFailCount()).toBe(i);
      }

      // 5th attempt triggers lockout
      const res5 = await verifyGuestOtp(pool, {
        email: buyer.email,
        code: '000005',
        requestId: 'req-uuid',
        buyer,
      });
      expect(res5.success).toBe(false);
      expect(res5.code).toBe('BLOCKED');
      expect(getFailCount()).toBe(5);

      // 6th attempt is blocked
      const res6 = await verifyGuestOtp(pool, {
        email: buyer.email,
        code: '123456', // Even with correct code
        requestId: 'req-uuid',
        buyer,
      });
      expect(res6.success).toBe(false);
      expect(res6.code).toBe('BLOCKED');
    });
  });
});
