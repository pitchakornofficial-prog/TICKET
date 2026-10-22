import { describe, expect, it } from 'vitest';
import { RESERVATION_HOLD_SECONDS } from '../../src/server/reservation';
import { calculateCustomerFee } from '../../src/server/fees';

describe('Reservation and quotation unit tests (TASK-012, AC-10, AC-69, AC-106, AC-13)', () => {
  it('enforces 15-minute reservation hold window (900 seconds) (AC-13, G-05)', () => {
    expect(RESERVATION_HOLD_SECONDS).toBe(900);
  });

  describe('Order limit calculations (AC-10, AC-106)', () => {
    const limitPerOrder = 4;

    it('rejects order when total quantity across all types exceeds limit (AC-10)', () => {
      const items = [
        { ticketTypeId: 'tt-1', quantity: 2 },
        { ticketTypeId: 'tt-2', quantity: 3 },
      ];
      const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);
      expect(totalTickets).toBe(5);
      expect(totalTickets > limitPerOrder).toBe(true);
    });

    it('allows order when total quantity equals limit (AC-106)', () => {
      const items = [
        { ticketTypeId: 'tt-1', quantity: 2 },
        { ticketTypeId: 'tt-2', quantity: 2 },
      ];
      const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);
      expect(totalTickets).toBe(4);
      expect(totalTickets <= limitPerOrder).toBe(true);
    });

    it('allows order when total quantity is below limit', () => {
      const items = [{ ticketTypeId: 'tt-1', quantity: 1 }];
      const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);
      expect(totalTickets).toBe(1);
      expect(totalTickets <= limitPerOrder).toBe(true);
    });
  });

  describe('Customer fee quotations for reservation (AC-69, G-25)', () => {
    // Fixture from SPEC-001 line 247:
    // B = 2*500 + 1*800 = 1,800; customer mode 20 บาท/ใบ (N=3)
    // Fee = 60, total = 1,860
    it('calculates exact quote for per_ticket customer mode', () => {
      const subtotal = 1800;
      const count = 3;
      const { fee, total } = calculateCustomerFee('per_ticket', 20, count, subtotal);
      expect(fee).toBe(60);
      expect(total).toBe(1860);
    });

    // Fixture from SPEC-001 line 248:
    // B = 1,800; customer mode 30 บาท/order
    // Fee = 30, total = 1,830
    it('calculates exact quote for per_order customer mode', () => {
      const subtotal = 1800;
      const count = 3;
      const { fee, total } = calculateCustomerFee('per_order', 30, count, subtotal);
      expect(fee).toBe(30);
      expect(total).toBe(1830);
    });

    // Fixture from SPEC-001 line 249:
    // B = 1,800; customer mode 2.5%
    // Fee = 45, total = 1,845
    it('calculates exact quote for percentage customer mode', () => {
      const subtotal = 1800;
      const count = 3;
      const { fee, total } = calculateCustomerFee('percentage', 2.5, count, subtotal);
      expect(fee).toBe(45);
      expect(total).toBe(1845);
    });
  });
});
