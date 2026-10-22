import { describe, expect, it } from 'vitest';
import { calculateEventAccounting } from '../../src/server/reports';

describe('TASK-030: Reserve Release Unit Tests (AC-83, G-30, G-31)', () => {
  it('1. Settlement and reserve invariant: E900, P810, H90 yields A_pay=0; releasing reserve U=90 yields H=0, A_pay=90 (AC-83, SPEC-001 line 270)', () => {
    // 1A. Before release: E = 900, P = 810, s = 10%, U = 0
    // L = 900 - 810 = 90
    // Target = 90, Outstanding = 90, Held H = 90, Payable A_pay = 0
    const beforeRelease = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 100, // E = 900
      reservePercentage: 10,
      totalPaidOut: 810, // P = 810
      totalDebtRepaid: 0,
      totalReserveReleased: 0, // U = 0
    });

    expect(beforeRelease.netEntitlement).toBe(900);
    expect(beforeRelease.netLiability).toBe(90);
    expect(beforeRelease.reserveTarget).toBe(90);
    expect(beforeRelease.actualHeldReserve).toBe(90);
    expect(beforeRelease.payableAmount).toBe(0);
    expect(beforeRelease.totalPaidOut).toBe(810);

    // 1B. After owner releases reserve of 90: U = 90
    // Reserve target = 90, Outstanding = max(0, 90 - 90) = 0
    // Held H = min(0, max(90, 0)) = 0
    // Payable A_pay = max(0, 90 - 0) = 90!
    const afterRelease = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 100,
      reservePercentage: 10,
      totalPaidOut: 810,
      totalDebtRepaid: 0,
      totalReserveReleased: 90, // U = 90
    });

    expect(afterRelease.netEntitlement).toBe(900);
    expect(afterRelease.netLiability).toBe(90);
    expect(afterRelease.reserveTarget).toBe(90);
    expect(afterRelease.reserveOutstanding).toBe(0);
    expect(afterRelease.actualHeldReserve).toBe(0);
    expect(afterRelease.payableAmount).toBe(90);
    expect(afterRelease.totalPaidOut).toBe(810);
  });

  it('2. Partial reserve release increases payable proportionally (AC-83)', () => {
    // E = 1000, P = 0, s = 10% -> Target = 100, Held = 100, Payable = 900
    const initial = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 0,
      orderFeesSum: 0,
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(initial.actualHeldReserve).toBe(100);
    expect(initial.payableAmount).toBe(900);

    // Release 40 out of 100 -> U = 40
    // Outstanding = 60, Held = 60, Payable = 940
    const partial = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 0,
      orderFeesSum: 0,
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 40,
    });

    expect(partial.actualHeldReserve).toBe(60);
    expect(partial.payableAmount).toBe(940);
  });

  it('3. When approved refunds reduce net entitlement, reserve target adjusts without negative held reserve (G-30, AC-81)', () => {
    // E drops to -200 due to refunds -> Target = max(0, -200) * 10% = 0, Held = 0
    const negativeEntitlement = calculateEventAccounting({
      netSales: 0,
      grossSales: 1000,
      approvedRefunds: 1000,
      organizerFeeMode: 'flat_fee',
      organizerFeeRate: 200,
      orderFeesSum: 0,
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(negativeEntitlement.netEntitlement).toBe(-200);
    expect(negativeEntitlement.reserveTarget).toBe(0);
    expect(negativeEntitlement.actualHeldReserve).toBe(0);
    expect(negativeEntitlement.payableAmount).toBe(0);
    expect(negativeEntitlement.isDebt).toBe(true);
  });

  it('4. Releasing reserve does not create automatic bank payout; P remains unchanged until owner pays (AC-83, TASK-029 boundary)', () => {
    const released = calculateEventAccounting({
      netSales: 1000,
      grossSales: 1000,
      approvedRefunds: 0,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 100,
      reservePercentage: 10,
      totalPaidOut: 810,
      totalDebtRepaid: 0,
      totalReserveReleased: 90,
    });

    // P is strictly unchanged (810); it is not automatically 900
    expect(released.totalPaidOut).toBe(810);
    expect(released.payableAmount).toBe(90);
  });
});
