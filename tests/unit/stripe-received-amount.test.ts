import type { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import { processStripeSuccessEvent } from '../../src/server/payment';
import { createStripeSuccessEvent, type StripePaymentIntent } from '../../src/server/stripe';

const mocks = vi.hoisted(() => ({
  retrieveIntent: vi.fn(),
  issueTickets: vi.fn(),
  sendTicketsEmail: vi.fn(),
}));

vi.mock('@/server/stripe', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/server/stripe')>(),
  getStripeClient: () => ({ retrievePaymentIntent: mocks.retrieveIntent }),
  isStripeLiveMode: () => true,
}));
vi.mock('@/server/reservation', () => ({ ensureReservationSchema: vi.fn() }));
vi.mock('@/server/tickets', () => ({
  ensureTicketSchema: vi.fn(),
  buildTicketsToIssue: mocks.issueTickets,
  issueTicketsForOrder: mocks.issueTickets,
}));
vi.mock('@/server/refunds', () => ({ ensureRefundSchema: vi.fn() }));
vi.mock('@/server/ticket-delivery', () => ({ sendOrderTicketsEmail: mocks.sendTicketsEmail }));

it.each([9999, 10001, undefined])(
  'rejects a Stripe amount_received of %s when the order and nominal intent are 10000 satang',
  async (amountReceived) => {
    const intent = {
      id: 'pi_amount_test',
      amount: 10_000,
      amount_received: 10_000,
      currency: 'thb',
      status: 'succeeded',
      livemode: true,
      metadata: { order_id: 'order-test' },
    } as StripePaymentIntent;
    const event = createStripeSuccessEvent({ intent });
    mocks.retrieveIntent.mockResolvedValue({ ...intent, amount_received: amountReceived });

    const query = vi.fn(async (sql: string) => {
      if (sql.includes('CREATE TABLE') || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('SELECT o."eventId"')) return { rowCount: 1, rows: [{ eventId: 'event-test' }] };
      if (sql.includes('FOR UPDATE OF pc, o')) {
        return {
          rowCount: 1,
          rows: [{ orderId: 'order-test', chargeId: intent.id, chargeAmount: 10_000, total: '100.00' }],
        };
      }
      throw new Error('Unexpected database query after the amount check');
    });

    const result = await processStripeSuccessEvent({ query } as unknown as Pool, { event });

    expect(result).toMatchObject({
      success: false,
      status: 'mismatch',
      orderId: 'order-test',
      message: expect.stringContaining('amount received'),
    });
    expect(mocks.issueTickets).not.toHaveBeenCalled();
    expect(mocks.sendTicketsEmail).not.toHaveBeenCalled();
  },
);
