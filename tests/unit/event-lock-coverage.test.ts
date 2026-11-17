import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EVENT_FEE_RESERVATION_LOCK_NAMESPACE,
  EVENT_FINANCIAL_LOCK_NAMESPACE,
} from '../../src/server/event-lock';

describe('Per-event serialization contracts', () => {
  it('uses one fee/reservation lock for fee writes and reservation creation', () => {
    const root = resolve(__dirname, '../..');
    const fees = readFileSync(resolve(root, 'src/server/fees.ts'), 'utf8');
    const reservation = readFileSync(resolve(root, 'src/server/reservation.ts'), 'utf8');
    expect(EVENT_FEE_RESERVATION_LOCK_NAMESPACE).not.toBe(EVENT_FINANCIAL_LOCK_NAMESPACE);
    expect(fees).toContain('lockEventFeeReservation(client, eventId)');
    expect(reservation).toContain('lockEventFeeReservation(client, input.eventId)');
    expect(reservation).toContain('hashtext(p_event_id), $' + '{EVENT_FEE_RESERVATION_LOCK_NAMESPACE}');
  });

  it('serializes refund, payment, payout, reserve release, debt repayment, and cancellation accounting by event', () => {
    const root = resolve(__dirname, '../..');
    const payment = readFileSync(resolve(root, 'src/server/payment.ts'), 'utf8');
    const refunds = readFileSync(resolve(root, 'src/server/refunds.ts'), 'utf8');
    const reports = readFileSync(resolve(root, 'src/server/reports.ts'), 'utf8');
    const events = readFileSync(resolve(root, 'src/server/events.ts'), 'utf8');

    expect(payment).toContain('lockEventFinancial(client, eventScopeRes.rows[0].eventId)');
    expect(refunds).toContain('lockEventFinancial(client, scopeRes.rows[0].eventId)');
    expect(reports).toContain('lockEventFinancial(client, input.eventId)');
    expect(events).toContain('lockEventFinancial(client, eventScopeRes.rows[0].eventId)');
    expect(reports.match(/lockEventFinancial\(client, input\.eventId\)/g)).toHaveLength(3);
    expect(refunds.match(/lockEventFinancial\(client, scopeRes\.rows\[0\]\.eventId\)/g)).toHaveLength(2);
  });
});
