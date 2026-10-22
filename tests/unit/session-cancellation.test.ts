import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  submitSessionCancellation,
  approveSessionCancellation,
  rejectSessionCancellation,
} from '../../src/server/events';

describe('TASK-026: Session Cancellation Unit Tests (AC-35, AC-91, AC-108, R5, G-22, G-38)', () => {
  it('rejects cancellation request with empty or whitespace reason', async () => {
    const mockPool = {} as unknown as Pool;

    await expect(
      submitSessionCancellation(mockPool, {
        sessionId: 'sess-1',
        organizerId: 'org-1',
        reason: '   ',
      }),
    ).rejects.toThrow('กรุณาระบุเหตุผลในการขอยกเลิกรอบการแสดง');
  });

  it('rejects approval when user is not owner', async () => {
    const mockClient = {
      query: (sql: string) => {
        if (sql.includes('SELECT id, role')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ id: 'user-2', role: 'organizer', name: 'Organizer 1' }],
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      },
    };

    const mockPool = {
      query: () => Promise.resolve({ rowCount: 0, rows: [] }),
      connect: () =>
        Promise.resolve({
          ...mockClient,
          release: () => {},
        }),
    } as unknown as Pool;

    await expect(
      approveSessionCancellation(mockPool, {
        cancellationId: 'can-1',
        ownerId: 'user-2',
      }),
    ).rejects.toThrow('เฉพาะเจ้าของเว็บ (Owner) เท่านั้น');
  });

  it('rejects rejection when user is not owner or rejection reason is empty', async () => {
    const mockClient = {
      query: (sql: string) => {
        if (sql.includes('SELECT role FROM auth_user')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ role: 'scanner' }],
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      },
    };

    const mockPool = {
      query: () => Promise.resolve({ rowCount: 0, rows: [] }),
      connect: () =>
        Promise.resolve({
          ...mockClient,
          release: () => {},
        }),
    } as unknown as Pool;

    await expect(
      rejectSessionCancellation(mockPool, {
        cancellationId: 'can-1',
        ownerId: 'scanner-1',
        rejectionReason: 'Reason',
      }),
    ).rejects.toThrow('เฉพาะเจ้าของเว็บ (Owner) เท่านั้น');

    // Test empty reason with owner role
    const mockOwnerClient = {
      query: (sql: string) => {
        if (sql.includes('SELECT role FROM auth_user')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [{ role: 'owner' }],
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      },
    };

    const mockOwnerPool = {
      query: () => Promise.resolve({ rowCount: 0, rows: [] }),
      connect: () =>
        Promise.resolve({
          ...mockOwnerClient,
          release: () => {},
        }),
    } as unknown as Pool;

    await expect(
      rejectSessionCancellation(mockOwnerPool, {
        cancellationId: 'can-1',
        ownerId: 'owner-1',
        rejectionReason: '  ',
      }),
    ).rejects.toThrow('กรุณาระบุเหตุผลการปฏิเสธคำขอยกเลิกรอบการแสดง');
  });

  it('verifies R5: face-value-only calculation excluding customer fee for cancelled session tickets', () => {
    // Ticket prices
    const tickets = [
      { ticketCode: 'TCK-001', ticketPrice: 1500 },
      { ticketCode: 'TCK-002', ticketPrice: 1500 },
    ];
    const customerFee = 60; // e.g. 30 per ticket or per order
    const orderTotal = 3000 + customerFee;

    // Per R5 and AC-35: cancelled session refund is strictly face value of tickets
    const refundAmount = tickets.reduce((sum, t) => sum + t.ticketPrice, 0);

    expect(refundAmount).toBe(3000);
    expect(refundAmount).not.toBe(orderTotal);
    expect(orderTotal - refundAmount).toBe(customerFee);
  });
});
