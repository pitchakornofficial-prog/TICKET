import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  recordManualRefundTransfer,
  recordManualRefundFailure,
  getRefundTransferProof,
} from '../../src/server/refunds';

describe('TASK-023: Manual Refund Transfer & Proof Unit Tests (AC-37, AC-92, AC-93)', () => {
  it('rejects manual transfer recording from non-owner roles (organizer, buyer, scanner) with FORBIDDEN', async () => {
    const mockPool = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    for (const role of ['buyer', 'organizer', 'scanner', 'guest']) {
      const res = await recordManualRefundTransfer(mockPool, {
        refundRequestId: 'REF-12345678',
        reviewerUserId: 'user-1',
        reviewerName: 'Non Owner',
        reviewerRole: role,
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN');
    }
  });

  it('rejects manual transfer failure recording from non-owner roles with FORBIDDEN', async () => {
    const mockPool = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    for (const role of ['buyer', 'organizer', 'scanner', 'guest']) {
      const res = await recordManualRefundFailure(mockPool, {
        refundRequestId: 'REF-12345678',
        failureReason: 'บัญชีปลายทางถูกปิด',
        reviewerUserId: 'user-1',
        reviewerName: 'Non Owner',
        reviewerRole: role,
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN');
    }
  });

  it('requires a non-empty failure reason when owner records transfer failure (AC-93)', async () => {
    const mockPool = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const res = await recordManualRefundFailure(mockPool, {
      refundRequestId: 'REF-12345678',
      failureReason: '    ',
      reviewerUserId: 'owner-1',
      reviewerName: 'Owner User',
      reviewerRole: 'owner',
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('VALIDATION_ERROR');
  });

  it('rejects access to refund proof files from non-owner roles with FORBIDDEN (AC-92)', async () => {
    const mockPool = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    for (const role of ['buyer', 'organizer', 'scanner', 'guest']) {
      const res = await getRefundTransferProof(mockPool, {
        refundRequestId: 'REF-12345678',
        actorRole: role,
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN');
    }
  });
});
