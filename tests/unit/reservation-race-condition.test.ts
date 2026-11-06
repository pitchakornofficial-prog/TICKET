import { describe, expect, it } from 'vitest';
import { createReservation } from '../../src/server/reservation';
import type { Pool, PoolClient } from 'pg';

describe('Issue #8: Anti-Scalping Reservation Race Condition Prevention (D-59, AC-10)', () => {
  it('executes pg_advisory_xact_lock on (eventId, buyerEmail) inside transaction before checking cumulative count', async () => {
    const executedQueries: { sql: string; params?: unknown[] }[] = [];
    const eventId = 'ev-test-123';
    const email = 'buyer@ticket.invalid';
    const token = 'token-uuid-1';

    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        executedQueries.push({ sql, params });

        if (sql.includes('SELECT token, email, name, phone, purpose')) {
          return {
            rowCount: 1,
            rows: [{
              token,
              email,
              name: 'สมชาย ใจดี',
              phone: '0812345678',
              purpose: 'checkout',
              verifiedAt: new Date(),
              expiresAt: new Date(Date.now() + 1800000),
            }],
          };
        }

        if (sql.includes('SELECT pg_advisory_xact_lock')) {
          return { rowCount: 1, rows: [] };
        }

        if (sql.includes('SELECT id, title, "limitPerOrder", status FROM events')) {
          return {
            rowCount: 1,
            rows: [{ id: eventId, title: 'Concert', limitPerOrder: 4, status: 'published' }],
          };
        }

        if (sql.includes('SELECT GREATEST(0,') && sql.includes('FROM orders o')) {
          // getBuyerTicketCountForEvent
          return {
            rowCount: 1,
            rows: [{ total: 0 }],
          };
        }

        if (sql.includes('SELECT id, status FROM event_sessions')) {
          return {
            rowCount: 1,
            rows: [{ id: 'sess-1', status: 'approved' }],
          };
        }

        if (sql.includes('FROM ticket_types')) {
          return {
            rowCount: 1,
            rows: [{ id: 'tt-1', name: 'VIP', price: 1000, quota: 100, sessionId: 'sess-1' }],
          };
        }

        if (sql.includes('SELECT GREATEST(0,') && sql.includes('FROM order_items oi')) {
          // held quota for ticket type
          return {
            rowCount: 1,
            rows: [{ held: 0 }],
          };
        }

        if (sql.includes('SELECT "organizerFeeMode", "organizerFeeRate" FROM event_fee_settings')) {
          return {
            rowCount: 1,
            rows: [{ organizerFeeMode: 'percentage', organizerFeeRate: 0, customerFeeMode: 'per_ticket', customerFeeRate: 0 }],
          };
        }

        if (sql.includes('INSERT INTO orders') || sql.includes('INSERT INTO order_items')) {
          return { rowCount: 1, rows: [] };
        }

        return { rowCount: 0, rows: [] };
      },
      release: () => {},
    };

    const mockPool = {
      connect: async () => client as unknown as PoolClient,
      query: client.query,
    } as unknown as Pool;

    const res = await createReservation(mockPool, {
      verifiedToken: token,
      eventId,
      sessionId: 'sess-1',
      items: [{ ticketTypeId: 'tt-1', quantity: 2 }],
    });

    expect(res).toBeDefined();
    expect(res.status).toBe('reserved');

    // 1. Verify advisory lock was called
    const lockQueryIndex = executedQueries.findIndex(q => q.sql.includes('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))'));
    expect(lockQueryIndex).toBeGreaterThanOrEqual(0);

    const lockQuery = executedQueries[lockQueryIndex];
    expect(lockQuery.params).toEqual([eventId, email]);

    // 2. Verify that advisory lock was executed BEFORE getBuyerTicketCountForEvent
    const buyerCountQueryIndex = executedQueries.findIndex(q => q.sql.includes('SELECT GREATEST(0,') && q.sql.includes('FROM orders o'));
    expect(buyerCountQueryIndex).toBeGreaterThan(lockQueryIndex);
  });
});
