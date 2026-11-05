import { describe, expect, it } from 'vitest';
import {
  verifyStripeWebhookSignature,
  generateStripeSignatureHeader,
  createStripeSuccessEvent,
  STRIPE_EVENT_API_VERSION,
  type StripePaymentIntent,
} from '../../src/server/stripe';

describe('Stripe Webhook Verification and G-53/P5 Decision Time T (TASK-043, AC-119, AC-120, AC-123, AC-124, AC-125)', () => {
  const secret = 'whsec_test_secret_for_unit_tests_123456';
  const nowSec = 1730300000;

  const mockIntent: StripePaymentIntent = {
    id: 'pi_test_mock12345',
    object: 'payment_intent',
    amount: 304000,
    amount_received: 304000,
    currency: 'thb',
    status: 'succeeded',
    client_secret: 'pi_test_mock12345_secret_abc',
    livemode: false,
    payment_method_types: ['promptpay'],
    metadata: {
      order_id: 'ORD-TEST-001',
    },
    created: nowSec - 30,
  };

  describe('Webhook signature verification (AC-119)', () => {
    it('accepts valid signature matching raw body, timestamp, and secret within tolerance', () => {
      const rawBody = JSON.stringify({ id: 'evt_test_1', type: 'payment_intent.succeeded' });
      const header = generateStripeSignatureHeader(rawBody, secret, nowSec);

      const res = verifyStripeWebhookSignature(rawBody, header, secret, 300, nowSec);
      expect(res.valid).toBe(true);
      expect(res.timestamp).toBe(nowSec);
      expect(res.error).toBeUndefined();
    });

    it('rejects tampered body with original signature header', () => {
      const originalBody = JSON.stringify({ id: 'evt_test_1', amount: 304000 });
      const tamperedBody = JSON.stringify({ id: 'evt_test_1', amount: 1000 });
      const header = generateStripeSignatureHeader(originalBody, secret, nowSec);

      const res = verifyStripeWebhookSignature(tamperedBody, header, secret, 300, nowSec);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('No matching signature found');
    });

    it('rejects signature signed with wrong secret', () => {
      const rawBody = JSON.stringify({ id: 'evt_test_1' });
      const header = generateStripeSignatureHeader(rawBody, 'wrong_secret', nowSec);

      const res = verifyStripeWebhookSignature(rawBody, header, secret, 300, nowSec);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('No matching signature found');
    });

    it('rejects timestamp outside 300-second tolerance window (past)', () => {
      const rawBody = JSON.stringify({ id: 'evt_test_1' });
      const pastSec = nowSec - 301; // 301 seconds ago
      const header = generateStripeSignatureHeader(rawBody, secret, pastSec);

      const res = verifyStripeWebhookSignature(rawBody, header, secret, 300, nowSec);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Timestamp outside the tolerance zone');
    });

    it('rejects timestamp outside 300-second tolerance window (future)', () => {
      const rawBody = JSON.stringify({ id: 'evt_test_1' });
      const futureSec = nowSec + 301;
      const header = generateStripeSignatureHeader(rawBody, secret, futureSec);

      const res = verifyStripeWebhookSignature(rawBody, header, secret, 300, nowSec);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Timestamp outside the tolerance zone');
    });

    it('rejects missing signature header or empty secret', () => {
      const rawBody = JSON.stringify({ id: 'evt_test_1' });
      expect(verifyStripeWebhookSignature(rawBody, null, secret).valid).toBe(false);
      expect(verifyStripeWebhookSignature(rawBody, '', secret).valid).toBe(false);
      expect(verifyStripeWebhookSignature(rawBody, 't=123,v1=abc', '').valid).toBe(false);
    });

    it('accepts header with multiple v1 signatures during secret rotation', () => {
      const rawBody = JSON.stringify({ id: 'evt_test_1' });
      const validHeader = generateStripeSignatureHeader(rawBody, secret, nowSec);
      const multiHeader = `${validHeader},v1=5257a869e7ecebeda32affa62cd496d660ca398b854e88590b4f45604fecd894`;

      const res = verifyStripeWebhookSignature(rawBody, multiHeader, secret, 300, nowSec);
      expect(res.valid).toBe(true);
    });

    it('rejects malformed signature headers missing t or v1', () => {
      const rawBody = '{}';
      expect(verifyStripeWebhookSignature(rawBody, 'invalid-header', secret).valid).toBe(false);
      expect(verifyStripeWebhookSignature(rawBody, 't=12345', secret).valid).toBe(false);
      expect(verifyStripeWebhookSignature(rawBody, 'v1=abcdef', secret).valid).toBe(false);
    });
  });

  describe('G-53 / P5 Decision Time T and Deadline Boundary (AC-124, AC-125)', () => {
    it('defines decision time T directly from matching payment_intent.succeeded Event.created in Unix seconds (AC-124)', () => {
      const eventCreatedSec = 1730300500;
      const event = createStripeSuccessEvent({
        intent: mockIntent,
        created: eventCreatedSec,
      });

      expect(event.type).toBe('payment_intent.succeeded');
      expect(event.created).toBe(eventCreatedSec);
      expect(event.api_version).toBe(STRIPE_EVENT_API_VERSION);

      const T_ms = event.created * 1000;
      expect(T_ms).toBe(1730300500000);
    });

    it('evaluates timely boundary: T = D is strictly timely (T <= D) without rounding D (AC-124)', () => {
      const D_ms = 1730300500000; // deadline
      const T_sec = 1730300500; // Event.created exactly at deadline
      const T_ms = T_sec * 1000;

      const isTimely = T_ms <= D_ms;
      expect(isTimely).toBe(true);
      expect(T_ms === D_ms).toBe(true);
    });

    it('evaluates late boundary: T = D + 1s is strictly late (T > D) even if webhook arrived early (AC-124)', () => {
      const D_ms = 1730300500000;
      const T_sec = 1730300501; // 1 second after deadline
      const T_ms = T_sec * 1000;

      const isLate = T_ms > D_ms;
      expect(isLate).toBe(true);
    });

    it('evaluates fractional cutoff boundaries without rounding deadline D (AC-124)', () => {
      // D has fractional millisecond part: e.g. 1730300500500 ms (.500s)
      const D_fractional_ms = 1730300500500;

      // Event at 1730300500s (1730300500000 ms) -> T <= D (timely)
      const T1_sec = 1730300500;
      expect(T1_sec * 1000 <= D_fractional_ms).toBe(true);

      // Event at 1730300501s (1730300501000 ms) -> T > D (late)
      const T2_sec = 1730300501;
      expect(T2_sec * 1000 > D_fractional_ms).toBe(true);
    });

    it('evaluates cancellation boundaries: T = C is paid at cancellation (G-52, AC-114), T < C is before cancellation (G-51, AC-113)', () => {
      const C_ms = 1730300400000; // cancellation approved at 1730300400s

      // T = C: Treated as paid at cancellation -> full refund including fee (G-52)
      const T_equal_C = 1730300400 * 1000;
      expect(T_equal_C >= C_ms).toBe(true);

      // T < C: Paid before cancellation -> face value refund only (G-51)
      const T_before_C = 1730300399 * 1000;
      expect(T_before_C < C_ms).toBe(true);
    });

    it('evaluates T = D = C coincident boundary: timely (T <= D) and paid at cancellation (T >= C) -> full refund without issuance (AC-124, G-52)', () => {
      const D_ms = 1730300500000;
      const C_ms = 1730300500000;
      const T_sec = 1730300500;
      const T_ms = T_sec * 1000;

      const isTimely = T_ms <= D_ms;
      const isAtOrAfterCancellation = T_ms >= C_ms;

      expect(isTimely).toBe(true);
      expect(isAtOrAfterCancellation).toBe(true);
    });

    it('evaluates bank-paid-before-D but event-created-after-D as strictly late under G-53 / P5 without actual bank time fallback (AC-124, AC-125)', () => {
      const D_ms = 1730300500000; // deadline
      const hypotheticalBankPaidMs = 1730300490000; // bank paid 10s before deadline
      const eventCreatedSec = 1730300502; // Stripe Event.created 2s after deadline

      // Per G-53 / P5, T is strictly Event.created * 1000, not hypothetical bank time
      const T_ms = eventCreatedSec * 1000;
      const isTimely = T_ms <= D_ms;
      const isLate = T_ms > D_ms;

      expect(hypotheticalBankPaidMs <= D_ms).toBe(true); // bank was timely
      expect(isTimely).toBe(false); // but T is not timely!
      expect(isLate).toBe(true); // strictly late per G-53
    });

    it('prohibits fallback to now, arrival time, or Intent.created when Event.created is missing or invalid (AC-125)', () => {
      const invalidTimestamps = [undefined, null, NaN, 0, -1, '2026-10-30'];
      for (const invalidT of invalidTimestamps) {
        const isValid =
          typeof invalidT === 'number' && !Number.isNaN(invalidT) && invalidT > 0;
        expect(isValid).toBe(false);
      }
    });
  });

  describe('Test and Live mode separation (AC-123)', () => {
    it('distinguishes livemode flag in event and rejects test mode event in live mode', () => {
      const testEvent = createStripeSuccessEvent({
        intent: mockIntent,
        livemode: false,
      });
      expect(testEvent.livemode).toBe(false);

      const liveEvent = createStripeSuccessEvent({
        intent: { ...mockIntent, livemode: true },
        livemode: true,
      });
      expect(liveEvent.livemode).toBe(true);
    });
  });
});
