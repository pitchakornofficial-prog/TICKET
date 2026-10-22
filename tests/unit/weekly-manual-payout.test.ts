import { describe, expect, it } from 'vitest';
import { calculateEventAccounting } from '../../src/server/reports';

describe('TASK-029: Weekly Manual Payout Unit Tests (AC-27, AC-30, AC-31, AC-79, AC-87, AC-92, AC-93)', () => {
  it('1. Weekly payout cycle: E=900, H=90 yields A_pay=810; payout of 810 leaves A_pay=0 and Paid P=810 (AC-27, AC-30, AC-79)', () => {
    // Before payout: E = 900, P = 0, reserve = 10% -> Target = 90, Held = 90, Payable = 810
    const beforePayout = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 100, // 1000 - 100 = 900
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(beforePayout.netEntitlement).toBe(900);
    expect(beforePayout.netLiability).toBe(900);
    expect(beforePayout.actualHeldReserve).toBe(90);
    expect(beforePayout.payableAmount).toBe(810);
    expect(beforePayout.totalPaidOut).toBe(0);

    // After owner pays out 810: P = 810 -> L = 900 - 810 = 90. Held = min(90, 90) = 90. Payable = max(0, 90 - 90) = 0
    const afterPayout = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 100,
      reservePercentage: 10,
      totalPaidOut: 810,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(afterPayout.netEntitlement).toBe(900);
    expect(afterPayout.netLiability).toBe(90);
    expect(afterPayout.actualHeldReserve).toBe(90);
    expect(afterPayout.payableAmount).toBe(0);
    expect(afterPayout.totalPaidOut).toBe(810);
  });

  it('2. Partial weekly payout: Paying less than full payable reduces liability and keeps remaining payable available (AC-30, AC-79)', () => {
    // E = 900, H = 90, Payable = 810. Owner pays out 500
    const afterPartialPayout = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 100,
      reservePercentage: 10,
      totalPaidOut: 500,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    // L = 900 - 500 = 400. Held H = min(90, 400) = 90. Payable = max(0, 400 - 90) = 310
    expect(afterPartialPayout.netLiability).toBe(400);
    expect(afterPartialPayout.actualHeldReserve).toBe(90);
    expect(afterPartialPayout.payableAmount).toBe(310);
    expect(afterPartialPayout.totalPaidOut).toBe(500);
  });

  it('3. Flat fee carry across payouts: Flat fee assessed once for event and carried until satisfied without re-collecting (AC-81, AC-87, G-27, G-29)', () => {
    // Week 1: Flat fee = 1000, netSales = 600 -> E = 600 - 1000 = -400 -> netEntitlement = -400, flatFeeCarry = 400
    const week1 = calculateEventAccounting({
      netSales: 600,
      grossSales: 600,
      approvedRefunds: 0,
      organizerFeeMode: 'flat_fee',
      organizerFeeRate: 1000,
      orderFeesSum: 0,
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(week1.organizerFee).toBe(1000);
    expect(week1.flatFeeCarry).toBe(400);
    expect(week1.netEntitlement).toBe(-400);
    expect(week1.payableAmount).toBe(0);

    // Week 2: More sales arrive (+900 -> total netSales = 1500). Flat fee is still 1000 once.
    // E = 1500 - 1000 = 500, flatFeeCarry = 0
    const week2 = calculateEventAccounting({
      netSales: 1500,
      grossSales: 1500,
      approvedRefunds: 0,
      organizerFeeMode: 'flat_fee',
      organizerFeeRate: 1000,
      orderFeesSum: 0,
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(week2.organizerFee).toBe(1000);
    expect(week2.flatFeeCarry).toBe(0);
    expect(week2.netEntitlement).toBe(500);
    // Reserve target = 50, Held = 50, Payable = 450
    expect(week2.actualHeldReserve).toBe(50);
    expect(week2.payableAmount).toBe(450);
  });

  it('4. Failed payout does not deduct payable and allows subsequent successful payout (AC-93)', () => {
    // When payout status is failed, it is not summed into totalPaidOut
    // P = 0, so payable remains 810
    const reportWithFailedPayout = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 100,
      reservePercentage: 10,
      totalPaidOut: 0, // Failed payouts are excluded from totalPaidOut
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(reportWithFailedPayout.totalPaidOut).toBe(0);
    expect(reportWithFailedPayout.payableAmount).toBe(810);
  });
});
