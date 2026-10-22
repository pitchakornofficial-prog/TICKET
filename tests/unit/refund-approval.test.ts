import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { approveRefundRequest, rejectRefundRequest } from '../../src/server/refunds';

describe('TASK-022: Refund Approval Unit Tests (AC-36, AC-88, AC-89, AC-90, AC-107)', () => {
  it('rejects approval from non-owner roles (organizer, buyer, scanner) with FORBIDDEN', async () => {
    const mockPool = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    for (const role of ['buyer', 'organizer', 'scanner', 'guest']) {
      const res = await approveRefundRequest(mockPool, {
        refundRequestId: 'REF-12345678',
        reviewerUserId: 'user-1',
        reviewerName: 'Non Owner',
        reviewerRole: role,
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN');
    }
  });

  it('rejects refund rejection from non-owner roles with FORBIDDEN', async () => {
    const mockPool = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const res = await rejectRefundRequest(mockPool, {
      refundRequestId: 'REF-12345678',
      rejectionReason: 'เหตุผลใดๆ',
      reviewerUserId: 'user-1',
      reviewerName: 'Organizer',
      reviewerRole: 'organizer',
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('FORBIDDEN');
  });

  it('requires a non-empty rejection reason when owner rejects', async () => {
    const mockPool = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const resEmpty = await rejectRefundRequest(mockPool, {
      refundRequestId: 'REF-12345678',
      rejectionReason: '   ',
      reviewerUserId: 'owner-1',
      reviewerName: 'Owner User',
      reviewerRole: 'owner',
    });

    expect(resEmpty.success).toBe(false);
    expect(resEmpty.code).toBe('INVALID_INPUT');
  });
});
