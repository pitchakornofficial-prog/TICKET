import { describe, expect, it } from 'vitest';
import { calculateEventAccounting } from '../../src/server/reports';

describe('Event debt and repayment accounting logic (TASK-031, AC-85, AC-86, G-33, G-39)', () => {
  it('calculates negative net liability L and excess payout refund debt when refund occurs after payout (SPEC-001 fixture: E=450, P=810, X=0 -> debt=360)', () => {
    // Before refund: Gross = 1000, 10% fee = 100 -> E = 900, P = 810 paid out
    // After 500 THB refund: netSales = 500, fee = 50 -> E = 450
    const result = calculateEventAccounting({
      netSales: 500,
      grossSales: 1000,
      approvedRefunds: 500,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 50,
      reservePercentage: 10,
      totalPaidOut: 810,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(result.netEntitlement).toBe(450);
    expect(result.totalPaidOut).toBe(810);
    expect(result.netLiability).toBe(-360); // L = E - P + X = 450 - 810 + 0 = -360
    expect(result.isDebt).toBe(true);
    expect(result.debtAmount).toBe(360);
    expect(result.excessPayoutRefundDebt).toBe(360);
    expect(result.flatFeeDebt).toBe(0);
    expect(result.actualHeldReserve).toBe(0); // min(reserveOutstanding, max(L, 0)) = 0 (G-33: no reserve held on debt)
    expect(result.payableAmount).toBe(0);
  });

  it('restores net liability L to 0 when repayment X is recorded (SPEC-001 fixture: X=360 -> L=0)', () => {
    const result = calculateEventAccounting({
      netSales: 500,
      grossSales: 1000,
      approvedRefunds: 500,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 50,
      reservePercentage: 10,
      totalPaidOut: 810,
      totalDebtRepaid: 360, // Repayment X recorded
      totalReserveReleased: 0,
    });

    expect(result.netEntitlement).toBe(450);
    expect(result.netLiability).toBe(0); // L = 450 - 810 + 360 = 0
    expect(result.isDebt).toBe(false);
    expect(result.debtAmount).toBe(0);
    expect(result.excessPayoutRefundDebt).toBe(0);
    expect(result.flatFeeDebt).toBe(0);
    expect(result.payableAmount).toBe(0);
  });

  it('distinguishes flat fee carry debt from refund excess debt (AC-85, G-29, G-33)', () => {
    // Flat fee mode: K = 500, Net sales = 200 -> E = 200 - 500 = -300
    const flatFeeResult = calculateEventAccounting({
      netSales: 200,
      grossSales: 200,
      approvedRefunds: 0,
      organizerFeeMode: 'flat_fee',
      organizerFeeRate: 500,
      orderFeesSum: 0,
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(flatFeeResult.netEntitlement).toBe(-300);
    expect(flatFeeResult.netLiability).toBe(-300);
    expect(flatFeeResult.isDebt).toBe(true);
    expect(flatFeeResult.debtAmount).toBe(300);
    expect(flatFeeResult.flatFeeDebt).toBe(300);
    expect(flatFeeResult.excessPayoutRefundDebt).toBe(0);
  });

  it('guarantees event isolation: Event A debt does NOT deduct Event B payable amount (AC-85)', () => {
    // Event A: in debt by 360 THB
    const eventA = calculateEventAccounting({
      netSales: 500,
      grossSales: 1000,
      approvedRefunds: 500,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 50,
      reservePercentage: 10,
      totalPaidOut: 810,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });
    expect(eventA.isDebt).toBe(true);
    expect(eventA.debtAmount).toBe(360);
    expect(eventA.payableAmount).toBe(0);

    // Event B: independently earned 900 net entitlement, 10% reserve -> payable is 810 THB
    const eventB = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 100,
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });
    expect(eventB.isDebt).toBe(false);
    expect(eventB.debtAmount).toBe(0);
    expect(eventB.actualHeldReserve).toBe(90);
    expect(eventB.payableAmount).toBe(810); // NOT deducted by Event A's 360 debt!
  });
});
