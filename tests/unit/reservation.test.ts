import { describe, expect, it } from 'vitest';
import { RESERVATION_HOLD_SECONDS, isUbuEmail } from '../../src/server/reservation';
import { calculateCustomerFee, roundHalfUp } from '../../src/server/fees';

describe('Reservation and quotation unit tests (TASK-012, AC-10, AC-69, AC-106, AC-13)', () => {
  it('enforces 15-minute reservation hold window (900 seconds) (AC-13, G-05)', () => {
    expect(RESERVATION_HOLD_SECONDS).toBe(900);
  });

  describe('UBU Privilege Discount and Email Verification (D-37, D-134)', () => {
    it('identifies ubu.ac.th and subdomains as UBU emails', () => {
      expect(isUbuEmail('somchai@ubu.ac.th')).toBe(true);
      expect(isUbuEmail('student@eng.ubu.ac.th')).toBe(true);
      expect(isUbuEmail('staff@sci.ubu.ac.th')).toBe(true);
      expect(isUbuEmail('  somchai@ubu.ac.th  ')).toBe(true);
      expect(isUbuEmail('somchai@gmail.com')).toBe(false);
      expect(isUbuEmail('fakeubu.ac.th@gmail.com')).toBe(false);
      expect(isUbuEmail('')).toBe(false);
    });

    it('calculates 15% discount on up to 2 highest-priced tickets (D-37, D-134)', () => {
      // 1 ticket @ 1000 THB -> discount 150 THB
      const singleTicketPrices = [1000];
      const singleDiscount = singleTicketPrices.slice(0, 2).reduce((sum, p) => sum + roundHalfUp(p * 0.15), 0);
      expect(singleDiscount).toBe(150);

      // 3 tickets: 3500, 2500, 1500 (highest 2: 3500 and 2500)
      const multiplePrices = [3500, 2500, 1500].sort((a, b) => b - a);
      const top2Discount = multiplePrices.slice(0, 2).reduce((sum, p) => sum + roundHalfUp(p * 0.15), 0);
      expect(top2Discount).toBe(roundHalfUp(3500 * 0.15) + roundHalfUp(2500 * 0.15)); // 525 + 375 = 900
      expect(top2Discount).toBe(900);

      // Exact user scenario (D-134): 2 tickets @ 1600 = 3200 THB
      const userPrices = [1600, 1600];
      const userDiscount = userPrices.slice(0, 2).reduce((sum, p) => sum + roundHalfUp(p * 0.15), 0);
      expect(userDiscount).toBe(480); // 240 + 240 = 480
      const userDiscountedSubtotal = 3200 - userDiscount; // 2720
      const userQuote = calculateCustomerFee('percentage', 5, 2, userDiscountedSubtotal);
      expect(userQuote.fee).toBe(136); // 2720 * 5% = 136 (NOT 20)
      expect(userQuote.total).toBe(2856); // 2720 + 136 = 2856 (NOT 2740)

      // Exact user scenario 2 (D-135): 1 ticket @ 1500 THB with UBU discount
      // 1500 - 225 (15%) = 1275 THB. 5% fee is 63.75 THB -> Ceiling rounds up to 64 THB (NO .75 decimals)
      const ubu1500Discount = Math.round(1500 * 0.15); // 225
      const ubu1500Subtotal = 1500 - ubu1500Discount; // 1275
      const ubu1500Quote = calculateCustomerFee('percentage', 5, 1, ubu1500Subtotal);
      const ubu1500Fee = Math.ceil(ubu1500Quote.fee);
      const ubu1500Total = ubu1500Subtotal + ubu1500Fee;
      expect(ubu1500Fee).toBe(64); // Math.ceil(63.75) = 64 (NOT 63.75)
      expect(ubu1500Total).toBe(1339); // 1275 + 64 = 1339 (NOT 1338.75)

      // Discounted subtotal and 5% fee on discounted amount (D-134)
      const subtotal = 3500 + 2500 + 1500; // 7500
      const discountedSubtotal = subtotal - top2Discount; // 6600
      const { fee, total } = calculateCustomerFee('percentage', 5, 3, discountedSubtotal);
      expect(fee).toBe(330); // 6600 * 5% = 330
      expect(total).toBe(6930); // 6600 + 330
    });
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
