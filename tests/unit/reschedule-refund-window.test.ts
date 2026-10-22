import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  calculateRefundCutoff,
  isWithinRefundWindow,
  isWithinSpecialRefundWindow,
} from '../../src/server/refunds';
import { configureSpecialRefundWindow } from '../../src/server/events';

describe('TASK-025: Reschedule and Special Refund Window Unit Tests (AC-38, AC-108, G-13)', () => {
  const sessionStartTime = new Date('2026-11-20T18:00:00.000Z');
  const windowStart = new Date('2026-11-15T00:00:00.000Z');
  const windowEnd = new Date('2026-11-18T23:59:59.000Z');

  it('correctly assesses special refund window boundaries (AC-38)', () => {
    // Exactly at window start
    expect(isWithinSpecialRefundWindow(windowStart, windowEnd, windowStart)).toBe(true);

    // Mid window
    const midWindow = new Date('2026-11-16T12:00:00.000Z');
    expect(isWithinSpecialRefundWindow(windowStart, windowEnd, midWindow)).toBe(true);

    // Exactly at window end
    expect(isWithinSpecialRefundWindow(windowStart, windowEnd, windowEnd)).toBe(true);

    // Before window start
    const beforeWindow = new Date('2026-11-14T23:59:59.000Z');
    expect(isWithinSpecialRefundWindow(windowStart, windowEnd, beforeWindow)).toBe(false);

    // After window end
    const afterWindow = new Date('2026-11-19T00:00:01.000Z');
    expect(isWithinSpecialRefundWindow(windowStart, windowEnd, afterWindow)).toBe(false);

    // Missing window boundaries
    expect(isWithinSpecialRefundWindow(null, windowEnd, midWindow)).toBe(false);
    expect(isWithinSpecialRefundWindow(windowStart, null, midWindow)).toBe(false);
  });

  it('allows refund eligibility past normal 168h cutoff when inside special refund window (AC-38, E2)', () => {
    const normalCutoff = calculateRefundCutoff(sessionStartTime);
    expect(normalCutoff.toISOString()).toBe('2026-11-13T18:00:00.000Z');

    // Test time: 2026-11-16T12:00:00.000Z (which is only 102 hours before session, past 168h cutoff)
    const testTime = new Date('2026-11-16T12:00:00.000Z');

    const isNormalEligible = isWithinRefundWindow(sessionStartTime, testTime);
    expect(isNormalEligible).toBe(false); // Past normal cutoff

    const isSpecialEligible = isWithinSpecialRefundWindow(windowStart, windowEnd, testTime);
    expect(isSpecialEligible).toBe(true); // Inside special window

    const combinedEligible = isNormalEligible || isSpecialEligible;
    expect(combinedEligible).toBe(true);
  });

  it('denies eligibility when time is past normal cutoff and outside special refund window', () => {
    // Time after special window closes (2026-11-19T10:00:00.000Z)
    const testTime = new Date('2026-11-19T10:00:00.000Z');

    const isNormalEligible = isWithinRefundWindow(sessionStartTime, testTime);
    expect(isNormalEligible).toBe(false);

    const isSpecialEligible = isWithinSpecialRefundWindow(windowStart, windowEnd, testTime);
    expect(isSpecialEligible).toBe(false);

    const combinedEligible = isNormalEligible || isSpecialEligible;
    expect(combinedEligible).toBe(false);
  });

  it('prevents non-owner actors from configuring special refund window (Role denial)', async () => {
    const mockPool = {
      connect: async () => ({
        query: async (sql: string) => {
          if (sql.includes('SELECT role FROM auth_user')) {
            return { rowCount: 1, rows: [{ role: 'organizer' }] };
          }
          return { rowCount: 0, rows: [] };
        },
        release: () => {},
      }),
      query: async () => ({ rowCount: 0, rows: [] }),
    } as unknown as Pool;

    await expect(
      configureSpecialRefundWindow(mockPool, {
        sessionId: 'sess-123',
        ownerId: 'user-organizer',
        specialRefundWindowStart: windowStart,
        specialRefundWindowEnd: windowEnd,
      }),
    ).rejects.toThrow('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่สามารถกำหนดช่วงเวลาขอคืนเงินพิเศษได้');
  });
});
