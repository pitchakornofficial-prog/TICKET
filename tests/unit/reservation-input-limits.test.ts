import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  createReservation,
  validateReservationBuyer,
  validateReservationItems,
} from '../../src/server/reservation';

describe('reservation input hard limits', () => {
  it('rejects more than 20 ticket types before querying the database', async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    const items = Array.from({ length: 21 }, (_, index) => ({ ticketTypeId: `type-${index}`, quantity: 1 }));

    await expect(createReservation(pool, {
      verifiedToken: 'verified-token',
      eventId: 'event-1',
      sessionId: 'session-1',
      items,
    })).rejects.toThrow('ไม่เกิน 20 รายการ');
    expect(pool.query).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 101])('rejects invalid per-item quantity %s', quantity => {
    expect(() => validateReservationItems([{ ticketTypeId: 'type-1', quantity }]))
      .toThrow('จำนวนเต็มระหว่าง 1 ถึง 100');
  });

  it('accepts a valid capped item and rejects oversized persisted buyer details', () => {
    expect(validateReservationItems([{ ticketTypeId: ' type-1 ', quantity: 100 }])).toEqual([
      { ticketTypeId: 'type-1', quantity: 100 },
    ]);

    const buyer = { email: 'buyer@example.com', name: 'Buyer', phone: '0812345678' };
    expect(() => validateReservationBuyer({ ...buyer, name: 'n'.repeat(121) })).toThrow('120 ตัวอักษร');
    expect(() => validateReservationBuyer({ ...buyer, email: `${'a'.repeat(246)}@example.com` })).toThrow('254 ตัวอักษร');
    expect(() => validateReservationBuyer({ ...buyer, phone: '1'.repeat(31) })).toThrow('30 ตัวอักษร');
  });
});
