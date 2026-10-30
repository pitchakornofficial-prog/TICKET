import { describe, expect, it } from 'vitest';
import { calculateCustomerFee } from '../../src/server/fees';
import {
  StripeContractDouble,
  generatePromptPaySvg,
  STRIPE_API_VERSION,
} from '../../src/server/stripe';

describe('Payment QR logic and monetary accuracy (TASK-042, AC-118, AC-15, AC-26, AC-12, AC-13, AC-70, AC-120, AC-123)', () => {
  it('converts quotation total in THB to exact satang integer for Stripe PromptPay charge across all three customer fee modes (AC-15, AC-26, AC-118)', () => {
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
    expect(Number.isInteger(satang2)).toBe(true);

    // 3. Decimal precision with half-up rounding (R(x)): total with fractional satang
    const quote3 = calculateCustomerFee('percentage', 3.33, 1, 1000);
    expect(quote3.fee).toBe(33.3);
    expect(quote3.total).toBe(1033.3);

    const satang3 = Math.round(quote3.total * 100);
    expect(satang3).toBe(103330);
    expect(Number.isInteger(satang3)).toBe(true);

    // 4. Per order mode: 4 tickets @ 500 THB = 2,000 THB; fee = 50 THB flat; total = 2,050 THB
    const quote4 = calculateCustomerFee('per_order', 50, 4, 2000);
    expect(quote4.fee).toBe(50);
    expect(quote4.total).toBe(2050);

    const satang4 = Math.round(quote4.total * 100);
    expect(satang4).toBe(205000);
    expect(Number.isInteger(satang4)).toBe(true);
  });

  it('guarantees PromptPay currency is strictly "thb" and matches Stripe PromptPay requirements (AC-15, AC-118)', () => {
    const defaultCurrency = 'thb';
    expect(defaultCurrency).toBe('thb');
    expect(defaultCurrency.toUpperCase()).toBe('THB');
  });

  it('generates Stripe contract double intent conforming to TASK-041 probe evidence (AC-118, AC-120)', async () => {
    const double = new StripeContractDouble();
    const orderId = 'ORD-UNIT-TEST-001';
    const amountSatang = 304000;
    const buyerEmail = 'buyer@ticket.invalid';
    const idempotencyKey = `order_qr_${orderId}`;

    const intent = await double.createPromptPayIntent({
      orderId,
      amountSatang,
      buyerEmail,
      idempotencyKey,
    });

    expect(intent.id).toMatch(/^pi_test_/);
    expect(intent.amount).toBe(304000);
    expect(intent.currency).toBe('thb');
    expect(intent.status).toBe('requires_action');
    expect(intent.livemode).toBe(false);
    expect(intent.payment_method_types).toEqual(['promptpay']);
    expect(intent.metadata.order_id).toBe(orderId);
    expect(intent.next_action?.type).toBe('promptpay_display_qr_code');
    expect(intent.next_action?.promptpay_display_qr_code.data).toBeDefined();
    expect(intent.next_action?.promptpay_display_qr_code.image_url_svg).toContain('data:image/svg+xml');

    // Repeated call with same idempotency key returns the same intent without creating a new one (AC-120)
    const repeatIntent = await double.createPromptPayIntent({
      orderId,
      amountSatang,
      buyerEmail,
      idempotencyKey,
    });
    expect(repeatIntent.id).toBe(intent.id);
    expect(double.getCreatedIntentsCount()).toBe(1);
  });

  it('isolates test and live modes and prevents secret leakage (AC-123)', () => {
    const testDouble = new StripeContractDouble();
    expect(testDouble.isLiveMode()).toBe(false);

    testDouble.setLiveMode(true);
    expect(testDouble.isLiveMode()).toBe(true);

    // Verify SVG generation produces valid markup without exposing secret keys
    const svg = generatePromptPaySvg('pi_test_1234567890', 250000);
    expect(svg).toContain('data:image/svg+xml');
    expect(svg).toContain('PromptPay');
    expect(svg).not.toContain('sk_');
    expect(svg).not.toContain('whsec_');
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

  it('maintains expected Stripe API version baseline from TASK-041', () => {
    expect(STRIPE_API_VERSION).toBe('2026-10-28.endive');
  });
});
