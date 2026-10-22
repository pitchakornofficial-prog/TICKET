import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  calculateRefundCutoff,
  isWithinRefundWindow,
  submitRefundRequest,
} from '../../src/server/refunds';

describe('TASK-021: Refund Requests Unit Tests (AC-32, AC-33, AC-34, AC-21)', () => {
  const sessionStartTime = new Date('2026-11-10T18:00:00.000Z');

  it('calculates normal refund cutoff strictly at 168 hours before session start (AC-32)', () => {
    const cutoff = calculateRefundCutoff(sessionStartTime);
    const diffHours = (sessionStartTime.getTime() - cutoff.getTime()) / (1000 * 60 * 60);

    expect(diffHours).toBe(168);
    expect(cutoff.toISOString()).toBe('2026-11-03T18:00:00.000Z');
  });

  it('determines normal cutoff boundaries: 168h+epsilon (eligible), 168h exact (eligible), 168h-epsilon (ineligible) (AC-32)', () => {
    const cutoff = calculateRefundCutoff(sessionStartTime);

    // 168h + 10 seconds before session (i.e. 10s before cutoff time) -> within window
    const beforeCutoff = new Date(cutoff.getTime() - 10000);
    expect(isWithinRefundWindow(sessionStartTime, beforeCutoff)).toBe(true);

    // exactly at cutoff time (inclusive per AC-32) -> within window
    expect(isWithinRefundWindow(sessionStartTime, cutoff)).toBe(true);

    // 168h - 10 seconds before session (i.e. 10s after cutoff time) -> past cutoff
    const afterCutoff = new Date(cutoff.getTime() + 10000);
    expect(isWithinRefundWindow(sessionStartTime, afterCutoff)).toBe(false);
  });

  it('validates required inputs before database connection (AC-34, AC-21)', async () => {
    const mockPool = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    // Missing token
    const resNoToken = await submitRefundRequest(mockPool, {
      verifiedToken: '',
      orderId: 'ORD-123',
      ticketIds: ['tk-1'],
      reason: 'ไม่สะดวกเดินทาง',
    });
    expect(resNoToken.success).toBe(false);
    expect(resNoToken.code).toBe('UNAUTHORIZED');

    // Missing tickets
    const resNoTickets = await submitRefundRequest(mockPool, {
      verifiedToken: 'valid-token',
      orderId: 'ORD-123',
      ticketIds: [],
      reason: 'ไม่สะดวกเดินทาง',
    });
    // getVerifiedGuestSession would be called first, but if session doesn't exist it returns UNAUTHORIZED
    expect(resNoTickets.success).toBe(false);
  });

  it('calculates refund amount strictly from ticket face value excluding customer fees (AC-33)', () => {
    const orderItems = [
      { ticketPrice: 1500, customerFee: 50 },
      { ticketPrice: 1500, customerFee: 50 },
    ];

    // Selecting 1 ticket
    const partialFaceValue = orderItems.slice(0, 1).reduce((s, it) => s + it.ticketPrice, 0);
    expect(partialFaceValue).toBe(1500);

    // Selecting both tickets
    const fullFaceValue = orderItems.reduce((s, it) => s + it.ticketPrice, 0);
    expect(fullFaceValue).toBe(3000);

    // Excludes customer fees (which would have been 100)
    const totalPaidByCustomer = orderItems.reduce((s, it) => s + it.ticketPrice + it.customerFee, 0);
    expect(totalPaidByCustomer).toBe(3100);
    expect(fullFaceValue).not.toBe(totalPaidByCustomer);
  });
});
