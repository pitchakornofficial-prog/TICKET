import { describe, expect, it } from 'vitest';
import { StripeContractDouble } from '../../src/server/stripe';

describe('Stripe Expiry and Cancellation Timeline Recovery Unit Tests (TASK-044, AC-121, AC-124, AC-125, G-53/P5)', () => {
  describe('StripeContractDouble cancellation contract (TASK-041 captured behavior)', () => {
    it('cancels requires_action intent and updates status to canceled', async () => {
      const double = new StripeContractDouble();
      const intent = await double.createPromptPayIntent({
        orderId: 'ORD-CANCEL-001',
        amountSatang: 150000,
        buyerEmail: 'buyer-cancel@ticket.invalid',
      });
      expect(intent.status).toBe('requires_action');

      const canceled = await double.cancelPaymentIntent(intent.id);
      expect(canceled.id).toBe(intent.id);
      expect(canceled.status).toBe('canceled');

      // Verify retrieval returns canceled
      const retrieved = await double.retrievePaymentIntent(intent.id);
      expect(retrieved.status).toBe('canceled');
    });

    it('rejects cancellation with standard error when intent is already succeeded (TASK-041 cancel-after-success probe)', async () => {
      const double = new StripeContractDouble();
      const intent = await double.createPromptPayIntent({
        orderId: 'ORD-SUCCEEDED-001',
        amountSatang: 200000,
        buyerEmail: 'buyer-succeeded@ticket.invalid',
      });

      // Mark intent as succeeded
      double.setIntentStatus(intent.id, 'succeeded');

      await expect(double.cancelPaymentIntent(intent.id)).rejects.toThrow(
        'You cannot cancel a PaymentIntent with status succeeded',
      );
    });

    it('handles simulated ambiguous cancel timeout without mutating intent status if unconfirmed', async () => {
      const double = new StripeContractDouble();
      const intent = await double.createPromptPayIntent({
        orderId: 'ORD-TIMEOUT-001',
        amountSatang: 100000,
        buyerEmail: 'buyer-timeout@ticket.invalid',
      });

      double.simulateTimeoutAfterCancelNext();
      await expect(double.cancelPaymentIntent(intent.id)).rejects.toThrow(
        'Stripe API request timed out (simulated ambiguous cancel timeout)',
      );

      // Subsequent call without timeout flag succeeds
      const canceled = await double.cancelPaymentIntent(intent.id);
      expect(canceled.status).toBe('canceled');
    });

    it('throws error when canceling non-existent intent', async () => {
      const double = new StripeContractDouble();
      await expect(double.cancelPaymentIntent('pi_non_existent')).rejects.toThrow(
        "No such payment_intent: 'pi_non_existent'",
      );
    });

    it('supports simulating provider failure error on cancel', async () => {
      const double = new StripeContractDouble();
      const intent = await double.createPromptPayIntent({
        orderId: 'ORD-FAIL-001',
        amountSatang: 100000,
        buyerEmail: 'buyer-fail@ticket.invalid',
      });

      double.setFailure(new Error('Stripe API unavailable (500)'));
      await expect(double.cancelPaymentIntent(intent.id)).rejects.toThrow('Stripe API unavailable (500)');

      double.setFailure(null);
      const canceled = await double.cancelPaymentIntent(intent.id);
      expect(canceled.status).toBe('canceled');
    });
  });

  describe('Timestamp boundary comparisons (T vs D vs C, G-53/P5, AC-124)', () => {
    // Pure calculation / rule evaluation mimicking G-53 / P5 contract
    function evaluatePaymentOutcome(params: {
      eventCreated?: number | null;
      expiresAtMs: number;
      isCancelledSession: boolean;
      cancellationApprovedAtMs?: number;
      availableQuota: number;
      requestedQuantity: number;
    }): {
      outcome:
        | 'pending_review_no_event'
        | 'timely_paid'
        | 'timely_insufficient_quota'
        | 'paid_after_deadline'
        | 'cancelled_refund_face_value'
        | 'cancelled_refund_full';
      refundAmountType?: 'face_value' | 'full';
    } {
      if (params.eventCreated === undefined || params.eventCreated === null || Number.isNaN(params.eventCreated) || params.eventCreated <= 0) {
        return { outcome: 'pending_review_no_event' };
      }

      const T_ms = params.eventCreated * 1000;
      const D_ms = params.expiresAtMs;
      const C_ms = params.cancellationApprovedAtMs ?? D_ms;

      // Rule 1: T > D always takes precedence as late payment (G-35, AC-124)
      // Even if session is cancelled (e.g. D < T < C), late branch / full refund applies.
      if (T_ms > D_ms) {
        return { outcome: 'paid_after_deadline', refundAmountType: 'full' };
      }

      // Rule 2: T <= D and Session is Cancelled (AC-112, AC-113, AC-114, G-51, G-52)
      if (params.isCancelledSession) {
        if (T_ms < C_ms) {
          // T < C: Refund face value only (subtotal), exclude customer fee
          return { outcome: 'cancelled_refund_face_value', refundAmountType: 'face_value' };
        }
        // T >= C (including T = C): Refund full amount (total) including customer fee
        return { outcome: 'cancelled_refund_full', refundAmountType: 'full' };
      }

      // Rule 3: T <= D and Session is Active
      if (params.availableQuota >= params.requestedQuantity) {
        return { outcome: 'timely_paid' };
      }
      return { outcome: 'timely_insufficient_quota', refundAmountType: 'full' };
    }

    it('T < D in active session: timely payment issues tickets if quota available', () => {
      const D = new Date('2026-12-15T19:15:00.000Z').getTime();
      const eventCreatedSec = Math.floor(D / 1000) - 10; // 10 seconds before deadline
      const res = evaluatePaymentOutcome({
        eventCreated: eventCreatedSec,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 2,
        requestedQuantity: 2,
      });
      expect(res.outcome).toBe('timely_paid');
    });

    it('T = D in active session: timely payment boundary condition (exact millisecond match)', () => {
      const D = new Date('2026-12-15T19:15:00.000Z').getTime();
      const eventCreatedSec = Math.floor(D / 1000); // T = D
      const res = evaluatePaymentOutcome({
        eventCreated: eventCreatedSec,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 1,
        requestedQuantity: 1,
      });
      expect(res.outcome).toBe('timely_paid');
    });

    it('T > D in active session: late payment triggers full refund review even if quota exists (G-35)', () => {
      const D = new Date('2026-12-15T19:15:00.000Z').getTime();
      const eventCreatedSec = Math.floor(D / 1000) + 1; // 1 second after deadline
      const res = evaluatePaymentOutcome({
        eventCreated: eventCreatedSec,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 10,
        requestedQuantity: 1,
      });
      expect(res.outcome).toBe('paid_after_deadline');
      expect(res.refundAmountType).toBe('full');
    });

    it('T <= D in active session but quota exhausted: no partial issue, triggers full refund review (AC-74, G-23)', () => {
      const D = new Date('2026-12-15T19:15:00.000Z').getTime();
      const eventCreatedSec = Math.floor(D / 1000) - 5;
      const res = evaluatePaymentOutcome({
        eventCreated: eventCreatedSec,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 1,
        requestedQuantity: 2, // requires 2, only 1 available
      });
      expect(res.outcome).toBe('timely_insufficient_quota');
      expect(res.refundAmountType).toBe('full');
    });

    it('Cancelled session with T <= D and T < C: refunds face value only, excludes customer fee (G-51, AC-113)', () => {
      const C = new Date('2026-12-15T19:05:00.000Z').getTime();
      const D = new Date('2026-12-15T19:15:00.000Z').getTime();
      const eventCreatedSec = Math.floor(C / 1000) - 60; // 1 minute before cancellation C
      const res = evaluatePaymentOutcome({
        eventCreated: eventCreatedSec,
        expiresAtMs: D,
        isCancelledSession: true,
        cancellationApprovedAtMs: C,
        availableQuota: 5,
        requestedQuantity: 1,
      });
      expect(res.outcome).toBe('cancelled_refund_face_value');
      expect(res.refundAmountType).toBe('face_value');
    });

    it('Cancelled session with T <= D and T = C: refunds full amount including customer fee (G-52, AC-114)', () => {
      const C = new Date('2026-12-15T19:05:00.000Z').getTime();
      const D = new Date('2026-12-15T19:15:00.000Z').getTime();
      const eventCreatedSec = Math.floor(C / 1000); // T = C exact second
      const res = evaluatePaymentOutcome({
        eventCreated: eventCreatedSec,
        expiresAtMs: D,
        isCancelledSession: true,
        cancellationApprovedAtMs: C,
        availableQuota: 5,
        requestedQuantity: 1,
      });
      expect(res.outcome).toBe('cancelled_refund_full');
      expect(res.refundAmountType).toBe('full');
    });

    it('Cancelled session with T <= D and T > C: refunds full amount including customer fee (G-52, AC-114)', () => {
      const C = new Date('2026-12-15T19:05:00.000Z').getTime();
      const D = new Date('2026-12-15T19:15:00.000Z').getTime();
      const eventCreatedSec = Math.floor(C / 1000) + 120; // 2 minutes after cancellation C, before D
      const res = evaluatePaymentOutcome({
        eventCreated: eventCreatedSec,
        expiresAtMs: D,
        isCancelledSession: true,
        cancellationApprovedAtMs: C,
        availableQuota: 5,
        requestedQuantity: 1,
      });
      expect(res.outcome).toBe('cancelled_refund_full');
      expect(res.refundAmountType).toBe('full');
    });

    it('Combined boundary: T = D = C refunds full amount including fee', () => {
      const C = new Date('2026-12-15T19:00:00.000Z').getTime();
      const D = C; // D = C
      const eventCreatedSec = Math.floor(C / 1000); // T = D = C
      const res = evaluatePaymentOutcome({
        eventCreated: eventCreatedSec,
        expiresAtMs: D,
        isCancelledSession: true,
        cancellationApprovedAtMs: C,
        availableQuota: 5,
        requestedQuantity: 1,
      });
      expect(res.outcome).toBe('cancelled_refund_full');
      expect(res.refundAmountType).toBe('full');
    });

    it('Combined boundary: D < T < C gives late branch full refund precedence (G-35)', () => {
      const D = new Date('2026-12-15T19:00:00.000Z').getTime();
      const C = new Date('2026-12-15T19:10:00.000Z').getTime();
      const eventCreatedSec = Math.floor(D / 1000) + 120; // D < T < C
      const res = evaluatePaymentOutcome({
        eventCreated: eventCreatedSec,
        expiresAtMs: D,
        isCancelledSession: true,
        cancellationApprovedAtMs: C,
        availableQuota: 5,
        requestedQuantity: 1,
      });
      expect(res.outcome).toBe('paid_after_deadline');
      expect(res.refundAmountType).toBe('full');
    });

    it('Fractional millisecond cutoffs compared directly without rounding down or up', () => {
      // D is 19:15:00.500Z (700500 ms)
      const D = 1730300700500;
      // T is 19:15:00 (700000 ms) -> T < D -> timely
      const resTimely = evaluatePaymentOutcome({
        eventCreated: 1730300700,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 2,
        requestedQuantity: 1,
      });
      expect(resTimely.outcome).toBe('timely_paid');

      // T is 19:15:01 (701000 ms) -> T > D -> late
      const resLate = evaluatePaymentOutcome({
        eventCreated: 1730300701,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 2,
        requestedQuantity: 1,
      });
      expect(resLate.outcome).toBe('paid_after_deadline');
    });

    it('Bank-paid-before-D but Event-created-after-D: strictly treated as late (G-53/P5)', () => {
      const D = 1730300000000;
      // Bank may have accepted at 1730299999 (before D), but Stripe Event created at 1730300002 (after D)
      const res = evaluatePaymentOutcome({
        eventCreated: 1730300002,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 2,
        requestedQuantity: 1,
      });
      expect(res.outcome).toBe('paid_after_deadline');
      expect(res.refundAmountType).toBe('full');
    });

    it('Missing or invalid Event.created stays pending review with zero fallback (AC-125)', () => {
      const D = 1730300000000;
      expect(evaluatePaymentOutcome({
        eventCreated: undefined,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 2,
        requestedQuantity: 1,
      }).outcome).toBe('pending_review_no_event');

      expect(evaluatePaymentOutcome({
        eventCreated: null,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 2,
        requestedQuantity: 1,
      }).outcome).toBe('pending_review_no_event');

      expect(evaluatePaymentOutcome({
        eventCreated: Number.NaN,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 2,
        requestedQuantity: 1,
      }).outcome).toBe('pending_review_no_event');

      expect(evaluatePaymentOutcome({
        eventCreated: 0,
        expiresAtMs: D,
        isCancelledSession: false,
        availableQuota: 2,
        requestedQuantity: 1,
      }).outcome).toBe('pending_review_no_event');
    });
  });
});
