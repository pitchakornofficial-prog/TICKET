import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  approveSessionAmendment,
  rejectSessionAmendment,
} from '../../src/server/events';

function createMockPool(role: string) {
  const client = {
    query: async (queryText: string) => {
      if (queryText.includes('FROM auth_user')) {
        return { rows: [{ role }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };

  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => client,
  } as unknown as Pool;
}

describe('TASK-024: Approved Live Edits Unit Tests (AC-67, AC-68, AC-109)', () => {
  it('rejects amendment approval from non-owner roles (organizer, buyer, scanner)', async () => {
    const mockPool = createMockPool('organizer');

    await expect(
      approveSessionAmendment(mockPool, {
        amendmentId: 'amd-123',
        ownerId: 'user-organizer',
      }),
    ).rejects.toThrow('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้น');
  });

  it('rejects amendment rejection from non-owner roles', async () => {
    const mockPool = createMockPool('scanner');

    await expect(
      rejectSessionAmendment(mockPool, {
        amendmentId: 'amd-123',
        ownerId: 'user-scanner',
        rejectionReason: 'เหตุผลใดๆ',
      }),
    ).rejects.toThrow('ไม่อนุญาต: เฉพาะเจ้าของเว็บ (Owner) เท่านั้น');
  });

  it('requires a non-empty rejection reason when owner rejects amendment', async () => {
    const mockPool = createMockPool('owner');

    await expect(
      rejectSessionAmendment(mockPool, {
        amendmentId: 'amd-123',
        ownerId: 'user-owner',
        rejectionReason: '    ',
      }),
    ).rejects.toThrow('กรุณาระบุเหตุผลการปฏิเสธคำขอแก้ไข');
  });
});
