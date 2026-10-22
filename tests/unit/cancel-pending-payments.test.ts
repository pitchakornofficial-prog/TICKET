import { describe, expect, it } from 'vitest';

interface EvaluatePaymentOnCancellationParams {
  paidAt: Date; // T
  deadline: Date; // D
  cancellationApprovedAt: Date; // C
  subtotal: number; // Face value
  customerFee: number;
  total: number;
}

interface PaymentCancellationDecision {
  issueTickets: boolean;
  refundType: 'none' | 'face_value_only' | 'full_refund';
  refundAmount: number;
  reasonCode: 'G-15_ON_TIME' | 'G-35_PAID_AFTER_DEADLINE' | 'G-51_PAID_BEFORE_CANCEL' | 'G-52_PAID_AFTER_CANCEL';
  customerFeeRefunded: boolean;
}

/**
 * Pure evaluation function for payment outcome on cancelled session (AC-112, AC-113, AC-114, G-50, G-51, G-52, G-35)
 */
function evaluatePaymentOnCancelledSession(
  params: EvaluatePaymentOnCancellationParams,
): PaymentCancellationDecision {
  const { paidAt, deadline, cancellationApprovedAt, subtotal, total } = params;

  // Never issue entry tickets for a cancelled session
  const issueTickets = false;

  // 1. T > D regardless of C -> G-35 applies: full refund including customer fee
  if (paidAt.getTime() > deadline.getTime()) {
    return {
      issueTickets,
      refundType: 'full_refund',
      refundAmount: total,
      reasonCode: 'G-35_PAID_AFTER_DEADLINE',
      customerFeeRefunded: true,
    };
  }

  // 2. T <= D: timely payment
  // Subcase A: T < C -> G-51 / AC-113: Purchase occurred before cancellation, refund face value only
  if (paidAt.getTime() < cancellationApprovedAt.getTime()) {
    return {
      issueTickets,
      refundType: 'face_value_only',
      refundAmount: subtotal,
      reasonCode: 'G-51_PAID_BEFORE_CANCEL',
      customerFeeRefunded: false,
    };
  }

  // Subcase B: T >= C (including T = C) -> G-52 / AC-114: Payment occurred at or after cancellation, full refund
  return {
    issueTickets,
    refundType: 'full_refund',
    refundAmount: total,
    reasonCode: 'G-52_PAID_AFTER_CANCEL',
    customerFeeRefunded: true,
  };
}

describe('Cancel pending payment decision matrix (TASK-027, AC-112, AC-113, AC-114, G-50, G-51, G-52, G-35)', () => {
  // Benchmark setup: C = 19:05:00, D = 19:15:00, subtotal = 2,000 THB, customerFee = 40 THB, total = 2,040 THB
  const C = new Date('2026-12-15T19:05:00.000Z');
  const D = new Date('2026-12-15T19:15:00.000Z');
  const subtotal = 2000;
  const customerFee = 40;
  const total = 2040;

  it('Case 1: T = 19:04 (T <= D and T < C) -> G-51 / AC-113 face value only, customer fee excluded', () => {
    const T = new Date('2026-12-15T19:04:00.000Z');
    const decision = evaluatePaymentOnCancelledSession({
      paidAt: T,
      deadline: D,
      cancellationApprovedAt: C,
      subtotal,
      customerFee,
      total,
    });

    expect(decision.issueTickets).toBe(false);
    expect(decision.refundType).toBe('face_value_only');
    expect(decision.refundAmount).toBe(2000);
    expect(decision.customerFeeRefunded).toBe(false);
    expect(decision.reasonCode).toBe('G-51_PAID_BEFORE_CANCEL');
  });

  it('Case 2: T = 19:05 (T <= D and T = C) -> G-52 / AC-114 full refund including customer fee', () => {
    const T = new Date('2026-12-15T19:05:00.000Z');
    const decision = evaluatePaymentOnCancelledSession({
      paidAt: T,
      deadline: D,
      cancellationApprovedAt: C,
      subtotal,
      customerFee,
      total,
    });

    expect(decision.issueTickets).toBe(false);
    expect(decision.refundType).toBe('full_refund');
    expect(decision.refundAmount).toBe(2040);
    expect(decision.customerFeeRefunded).toBe(true);
    expect(decision.reasonCode).toBe('G-52_PAID_AFTER_CANCEL');
  });

  it('Case 3: T = 19:06 (T <= D and T > C) -> G-52 / AC-114 full refund including customer fee', () => {
    const T = new Date('2026-12-15T19:06:00.000Z');
    const decision = evaluatePaymentOnCancelledSession({
      paidAt: T,
      deadline: D,
      cancellationApprovedAt: C,
      subtotal,
      customerFee,
      total,
    });

    expect(decision.issueTickets).toBe(false);
    expect(decision.refundType).toBe('full_refund');
    expect(decision.refundAmount).toBe(2040);
    expect(decision.customerFeeRefunded).toBe(true);
    expect(decision.reasonCode).toBe('G-52_PAID_AFTER_CANCEL');
  });

  it('Case 4: T = 19:15 (T = D and T > C) -> G-52 / AC-114 full refund including customer fee', () => {
    const T = new Date('2026-12-15T19:15:00.000Z');
    const decision = evaluatePaymentOnCancelledSession({
      paidAt: T,
      deadline: D,
      cancellationApprovedAt: C,
      subtotal,
      customerFee,
      total,
    });

    expect(decision.issueTickets).toBe(false);
    expect(decision.refundType).toBe('full_refund');
    expect(decision.refundAmount).toBe(2040);
    expect(decision.customerFeeRefunded).toBe(true);
    expect(decision.reasonCode).toBe('G-52_PAID_AFTER_CANCEL');
  });

  it('Case 5: T = 19:16 (T > D) -> G-35 applies full refund regardless of C', () => {
    const T = new Date('2026-12-15T19:16:00.000Z');
    const decision = evaluatePaymentOnCancelledSession({
      paidAt: T,
      deadline: D,
      cancellationApprovedAt: C,
      subtotal,
      customerFee,
      total,
    });

    expect(decision.issueTickets).toBe(false);
    expect(decision.refundType).toBe('full_refund');
    expect(decision.refundAmount).toBe(2040);
    expect(decision.customerFeeRefunded).toBe(true);
    expect(decision.reasonCode).toBe('G-35_PAID_AFTER_DEADLINE');
  });

  it('Case 6: D < T < C (D = 19:00, C = 19:10, T = 19:05) -> T > D, so G-35 applies full refund', () => {
    const earlyD = new Date('2026-12-15T19:00:00.000Z');
    const lateC = new Date('2026-12-15T19:10:00.000Z');
    const midT = new Date('2026-12-15T19:05:00.000Z');

    const decision = evaluatePaymentOnCancelledSession({
      paidAt: midT,
      deadline: earlyD,
      cancellationApprovedAt: lateC,
      subtotal,
      customerFee,
      total,
    });

    expect(decision.issueTickets).toBe(false);
    expect(decision.refundType).toBe('full_refund');
    expect(decision.refundAmount).toBe(2040);
    expect(decision.customerFeeRefunded).toBe(true);
    expect(decision.reasonCode).toBe('G-35_PAID_AFTER_DEADLINE');
  });
});
