import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { getOrganizerFinanceSummaries, getOwnerFinanceSummaries } from '../../src/server/reports';

describe('organizer payout account masking', () => {
  it('masks payout account digits for organizers while retaining the full owner value', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM events e') && sql.includes('"payoutAccountNumber"')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'event-1',
            title: 'Concert',
            location: 'Hall',
            status: 'approved',
            organizerId: 'organizer-1',
            organizerName: 'Organizer',
            organizerEmail: 'organizer@example.com',
            payoutBankName: 'Test Bank',
            payoutAccountNumber: '123-45-6789',
            payoutAccountName: 'Organizer',
            organizerFeeMode: 'percentage',
            organizerFeeRate: '0',
            reservePercentage: '0',
          }],
        };
      }
      return { rowCount: 0, rows: [] };
    });
    const pool = { query } as unknown as Pool;

    const organizer = await getOrganizerFinanceSummaries(pool, { id: 'organizer-1', role: 'organizer' });
    const owner = await getOwnerFinanceSummaries(pool, { id: 'owner-1', role: 'owner' });

    expect(organizer[0]?.payoutAccountNumber).not.toBe('123-45-6789');
    expect(organizer[0]?.payoutAccountNumber.replace(/\D/g, '')).toBe('6789');
    expect(owner[0]?.payoutAccountNumber).toBe('123-45-6789');
  });
});
