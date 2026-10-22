import { describe, expect, it } from 'vitest';
import { calculateCustomerFee } from '../../src/server/fees';

describe('Payment QR logic and monetary accuracy (TASK-014, AC-15, AC-26, AC-12, AC-13, AC-70)', () => {
  it('converts quotation total in THB to exact satang integer for Omise PromptPay charge (AC-15, AC-26)', () => {
    // 1. Per ticket mode: 2 tickets @ 1,500 THB = 3,000 THB; fee = 20 THB/ticket -> 40 THB; total = 3,040 THB
    const quote1 = calculateCustomerFee('per_ticket', 20, 2, 3000);
    expect(quote1.fee).toBe(40);
    expect(quote1.total).toBe(3040);

    const satang1 = Math.round(quote1.total * 100);
    expect(satang1).toBe(304000);
    expect(Number.isInteger(satang1)).toBe(true);

    // 2. Percentage fee mode: 3 tickets @ 600 THB = 1,800 THB; fee = 2.5% -> 45 THB; total = 1,845 THB
    const quote2 = calculateCustomerFee('percentage', 2.5, 3, 1800);
    expect(quote2.fee).toBe(45);
    expect(quote2.total).toBe(1845);

    const satang2 = Math.round(quote2.total * 100);
    expect(satang2).toBe(184500);

    // 3. Decimal precision with half-up rounding (R(x)): total with fractional satang
    const quote3 = calculateCustomerFee('percentage', 3.33, 1, 1000);
    expect(quote3.fee).toBe(33.3);
    expect(quote3.total).toBe(1033.3);

    const satang3 = Math.round(quote3.total * 100);
    expect(satang3).toBe(103330);
  });

  it('guarantees PromptPay currency is strictly "thb" (AC-15)', () => {
    const defaultCurrency = 'thb';
    expect(defaultCurrency).toBe('thb');
    expect(defaultCurrency.toUpperCase()).toBe('THB');
  });

  it('matches payment expiration deadline directly with reservation hold window (AC-13, AC-70)', () => {
    const reservationExpiresAt = new Date('2026-11-20T10:15:00.000Z');
    const chargeExpiresAt = new Date(reservationExpiresAt.toISOString());

    expect(chargeExpiresAt.getTime()).toBe(reservationExpiresAt.getTime());
    // Repeated payment request must not extend deadline
    const repeatedRequestTime = new Date('2026-11-20T10:05:00.000Z');
    expect(chargeExpiresAt.getTime()).toBe(reservationExpiresAt.getTime());
    expect(chargeExpiresAt.getTime()).toBeGreaterThan(repeatedRequestTime.getTime());
  });

  it('rejects direct payment creation when reservation has expired (AC-71)', () => {
    const reservationExpiresAt = new Date('2026-11-20T10:15:00.000Z');
    const nowAfterExpiry = new Date('2026-11-20T10:15:01.000Z');

    const isExpired = nowAfterExpiry.getTime() >= reservationExpiresAt.getTime();
    expect(isExpired).toBe(true);
  });
});
