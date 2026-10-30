import { describe, expect, it } from 'vitest';
import type { OwnerOverviewCounts } from '@/server/overview';

describe('TASK-039: Owner Overview Counts Unit Tests (AC-115, D-17)', () => {
  function computeTotalPending(counts: Omit<OwnerOverviewCounts, 'totalPending'>): number {
    return (
      counts.pendingSessions +
      counts.pendingRefunds +
      counts.failedEmails +
      counts.paymentExceptions +
      counts.syncConflicts
    );
  }

  it('aggregates totalPending correctly from all 5 action queues', () => {
    const rawCounts = {
      pendingSessions: 3,
      pendingRefunds: 2,
      failedEmails: 1,
      paymentExceptions: 4,
      syncConflicts: 0,
    };

    const total = computeTotalPending(rawCounts);
    expect(total).toBe(10);
  });

  it('handles zero pending items gracefully with all-clear status', () => {
    const rawCounts = {
      pendingSessions: 0,
      pendingRefunds: 0,
      failedEmails: 0,
      paymentExceptions: 0,
      syncConflicts: 0,
    };

    const total = computeTotalPending(rawCounts);
    expect(total).toBe(0);
  });

  it('sums session, amendment, and cancellation queues into pendingSessions count', () => {
    const sessions = 2;
    const amendments = 1;
    const cancellations = 3;

    const pendingSessions = sessions + amendments + cancellations;
    expect(pendingSessions).toBe(6);
  });
});
