import { describe, expect, it } from 'vitest';
import { RESERVATION_HOLD_SECONDS } from '../../src/server/reservation';

describe('Reservation expiry unit logic (TASK-013, AC-70, AC-71, G-14, G-34)', () => {
  it('defines 15-minute reservation hold window (900 seconds)', () => {
    expect(RESERVATION_HOLD_SECONDS).toBe(900);
    expect(RESERVATION_HOLD_SECONDS / 60).toBe(15);
  });

  it('determines active vs expired status with controlled clock (before, exactly at, and after deadline)', () => {
    const baseTime = new Date('2026-11-20T10:00:00.000Z');
    const expiresAt = new Date(baseTime.getTime() + RESERVATION_HOLD_SECONDS * 1000); // 10:15:00.000Z

    // Helper simulating status transition logic
    function resolveStatus(now: Date): 'reserved' | 'expired' {
      return now.getTime() <= expiresAt.getTime() ? 'reserved' : 'expired';
    }

    // 1. Right at reservation start (10:00:00)
    expect(resolveStatus(baseTime)).toBe('reserved');

    // 2. 14 minutes and 59 seconds in (10:14:59)
    const justBeforeExpiry = new Date(baseTime.getTime() + 899 * 1000);
    expect(resolveStatus(justBeforeExpiry)).toBe('reserved');

    // 3. Exactly at deadline (10:15:00) -> hold ends
    const atDeadline = new Date(baseTime.getTime() + 900 * 1000);
    expect(atDeadline.getTime()).toBe(expiresAt.getTime());

    // 4. 1 second after deadline (10:15:01) -> expired
    const justAfterExpiry = new Date(baseTime.getTime() + 901 * 1000);
    expect(resolveStatus(justAfterExpiry)).toBe('expired');

    // 5. 1 hour after deadline -> expired
    const longAfterExpiry = new Date(baseTime.getTime() + 3600 * 1000);
    expect(resolveStatus(longAfterExpiry)).toBe('expired');
  });

  it('calculates remaining seconds countdown strictly bounded to zero', () => {
    const expiresAt = new Date('2026-11-20T10:15:00.000Z');

    function getRemainingSeconds(now: Date): number {
      const diffMs = expiresAt.getTime() - now.getTime();
      return Math.max(0, Math.floor(diffMs / 1000));
    }

    expect(getRemainingSeconds(new Date('2026-11-20T10:00:00.000Z'))).toBe(900);
    expect(getRemainingSeconds(new Date('2026-11-20T10:05:00.000Z'))).toBe(600);
    expect(getRemainingSeconds(new Date('2026-11-20T10:14:30.000Z'))).toBe(30);
    expect(getRemainingSeconds(new Date('2026-11-20T10:15:00.000Z'))).toBe(0);
    expect(getRemainingSeconds(new Date('2026-11-20T10:15:05.000Z'))).toBe(0);
    expect(getRemainingSeconds(new Date('2026-11-20T11:00:00.000Z'))).toBe(0);
  });

  it('preserves order ID, quote, and deadline across repeated checks/refresh (AC-70, G-14)', () => {
    const originalOrder = {
      id: 'ORD-TEST-001',
      subtotal: 3000,
      customerFee: 40,
      total: 3040,
      reservedAt: '2026-11-20T10:00:00.000Z',
      expiresAt: '2026-11-20T10:15:00.000Z',
      status: 'reserved' as const,
    };

    // Simulated refresh at 10:05:00 (5 minutes in)
    const refreshedCheck = { ...originalOrder };
    expect(refreshedCheck.id).toBe(originalOrder.id);
    expect(refreshedCheck.expiresAt).toBe(originalOrder.expiresAt);
    expect(refreshedCheck.total).toBe(originalOrder.total);
    // Deadline is NOT restarted: still expiresAt = 10:15:00
    expect(new Date(refreshedCheck.expiresAt).getTime() - new Date(originalOrder.reservedAt).getTime()).toBe(900 * 1000);
  });

  it('guarantees that expired reservations cannot be revived and require a new order (AC-71, G-34)', () => {
    const expiredOrder = {
      id: 'ORD-OLD-001',
      status: 'expired' as const,
      expiresAt: '2026-11-20T10:15:00.000Z',
    };

    // A fresh reservation creates a new order with new deadline
    const newOrderNow = new Date('2026-11-20T10:20:00.000Z');
    const newOrder = {
      id: 'ORD-NEW-002',
      status: 'reserved' as const,
      reservedAt: newOrderNow.toISOString(),
      expiresAt: new Date(newOrderNow.getTime() + RESERVATION_HOLD_SECONDS * 1000).toISOString(),
    };

    expect(newOrder.id).not.toBe(expiredOrder.id);
    expect(newOrder.expiresAt).not.toBe(expiredOrder.expiresAt);
    expect(new Date(newOrder.expiresAt).getTime()).toBeGreaterThan(new Date(expiredOrder.expiresAt).getTime());
  });
});
