import { describe, expect, it } from 'vitest';
import {
  calculateEventAccounting,
  maskEmail,
  maskPhone,
} from '../../src/server/reports';
import {
  calculateOrganizerOrderFee,
  roundHalfUp,
} from '../../src/server/fees';

describe('TASK-028: Organizer Money Report Unit Tests (AC-28, AC-64, AC-77, AC-78, AC-80, AC-81, AC-82, AC-110, AC-84)', () => {
  it('1. Exact-decimal half-up rounding: two orders of 100.10 at 5% total 10.02, not 10.01 (AC-77, AC-78, AC-110, G-48)', () => {
    const v1 = 100.10;
    const v2 = 100.10;
    const rate = 5;

    // Per-order calculation: R(100.10 * 5 / 100) = R(5.005) = 5.01
    const f1 = calculateOrganizerOrderFee('percentage', rate, 1, v1);
    const f2 = calculateOrganizerOrderFee('percentage', rate, 1, v2);

    expect(f1).toBe(5.01);
    expect(f2).toBe(5.01);

    const totalF = roundHalfUp(f1 + f2);
    expect(totalF).toBe(10.02);

    // Summing bases first would yield 200.20 * 5% = 10.010 -> 10.01 (forbidden under G-48)
    const incorrectPooledFee = roundHalfUp(((v1 + v2) * rate) / 100);
    expect(incorrectPooledFee).toBe(10.01);
    expect(totalF).not.toBe(incorrectPooledFee);
  });

  it('2. Partial refund: fee recomputed on remaining tickets and adjusted by difference: 5.01 -> 2.50 with adjustment 2.51 (AC-80, G-28)', () => {
    // 1 order with 2 tickets at 50.05 each (total 100.10)
    const rate = 5;
    const originalTicketsCount = 2;
    const originalSubtotal = 100.10;

    const originalOrderFee = calculateOrganizerOrderFee('percentage', rate, originalTicketsCount, originalSubtotal);
    expect(originalOrderFee).toBe(5.01); // R(100.10 * 5%) = R(5.005) = 5.01

    // 1 ticket refunded (remaining: 1 ticket at 50.05)
    const remainingTicketsCount = 1;
    const remainingSubtotal = 50.05;

    const adjustedOrderFee = calculateOrganizerOrderFee('percentage', rate, remainingTicketsCount, remainingSubtotal);
    expect(adjustedOrderFee).toBe(2.50); // R(50.05 * 5%) = R(2.5025) = 2.50

    const feeAdjustment = roundHalfUp(originalOrderFee - adjustedOrderFee);
    expect(feeAdjustment).toBe(2.51); // 5.01 - 2.50 = 2.51 (not 5.01 / 2 = 2.505 -> 2.51)
  });

  it('3. Net entitlement, reserve target, and payable calculation: E=900, target=90, payable=810 (AC-77, AC-81, G-30)', () => {
    const grossSales = 1000;
    const netSales = 1000;
    const approvedRefunds = 0;
    const organizerFee = 100;
    const reservePercentage = 10; // 10%
    const totalPaidOut = 0;
    const totalDebtRepaid = 0;
    const totalReserveReleased = 0;

    const result = calculateEventAccounting({
      netSales,
      grossSales,
      approvedRefunds,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: organizerFee,
      reservePercentage,
      totalPaidOut,
      totalDebtRepaid,
      totalReserveReleased,
    });

    expect(result.netSales).toBe(1000);
    expect(result.organizerFee).toBe(100);
    expect(result.netEntitlement).toBe(900); // E = 1000 - 100 = 900
    expect(result.netLiability).toBe(900); // L = E - P + X = 900 - 0 + 0 = 900
    expect(result.reserveTarget).toBe(90); // T_res = R(900 * 10%) = 90
    expect(result.actualHeldReserve).toBe(90); // H = min(90, 900) = 90
    expect(result.payableAmount).toBe(810); // max(0, L - H) = 900 - 90 = 810
    expect(result.isDebt).toBe(false);
    expect(result.debtAmount).toBe(0);
  });

  it('4. Over-payout debt calculation: after paying 810, refund reduces E to 450 -> debt 360, held 0, payable 0 (AC-81, G-33)', () => {
    // E dropped to 450 after approved refund
    const grossSales = 1000;
    const approvedRefunds = 500;
    const netSales = 500;
    const organizerFee = 50; // remaining fee
    const reservePercentage = 10;
    const totalPaidOut = 810; // previously paid
    const totalDebtRepaid = 0;
    const totalReserveReleased = 0;

    const result = calculateEventAccounting({
      netSales,
      grossSales,
      approvedRefunds,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: organizerFee,
      reservePercentage,
      totalPaidOut,
      totalDebtRepaid,
      totalReserveReleased,
    });

    expect(result.netEntitlement).toBe(450); // E = 500 - 50 = 450
    expect(result.netLiability).toBe(-360); // L = 450 - 810 + 0 = -360
    expect(result.isDebt).toBe(true);
    expect(result.debtAmount).toBe(360); // Debt = 360
    expect(result.actualHeldReserve).toBe(0); // Held cannot be created from negative liability
    expect(result.payableAmount).toBe(0); // Payable is 0
  });

  it('5. Debt repayment: recording X=360 restores net liability to 0 (AC-85, AC-86, G-39)', () => {
    const result = calculateEventAccounting({
      netSales: 500,
      grossSales: 1000,
      approvedRefunds: 500,
      organizerFeeMode: 'percentage',
      organizerFeeRate: 10,
      orderFeesSum: 50,
      reservePercentage: 10,
      totalPaidOut: 810,
      totalDebtRepaid: 360, // Organizer repaid 360 debt
      totalReserveReleased: 0,
    });

    expect(result.netEntitlement).toBe(450);
    expect(result.netLiability).toBe(0); // L = 450 - 810 + 360 = 0
    expect(result.isDebt).toBe(false);
    expect(result.debtAmount).toBe(0);
    expect(result.actualHeldReserve).toBe(0);
    expect(result.payableAmount).toBe(0);
  });

  it('6. Flat fee mode: assessed once for the whole event, uncollected portion tracked as flatFeeCarry (AC-79, AC-81, G-27, G-29)', () => {
    const flatFee = 500;

    // Case 6A: 0 sales yet
    const initialReport = calculateEventAccounting({
      netSales: 0,
      grossSales: 0,
      approvedRefunds: 0,
      organizerFeeMode: 'flat_fee',
      organizerFeeRate: flatFee,
      orderFeesSum: 0,
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(initialReport.organizerFee).toBe(500);
    expect(initialReport.flatFeeCarry).toBe(500); // 500 uncollected carry
    expect(initialReport.netEntitlement).toBe(-500);
    expect(initialReport.payableAmount).toBe(0);

    // Case 6B: Sales of 2000
    const salesReport = calculateEventAccounting({
      netSales: 2000,
      grossSales: 2000,
      approvedRefunds: 0,
      organizerFeeMode: 'flat_fee',
      organizerFeeRate: flatFee,
      orderFeesSum: 0,
      reservePercentage: 10,
      totalPaidOut: 0,
      totalDebtRepaid: 0,
      totalReserveReleased: 0,
    });

    expect(salesReport.organizerFee).toBe(500);
    expect(salesReport.flatFeeCarry).toBe(0);
    expect(salesReport.netEntitlement).toBe(1500); // 2000 - 500
    expect(salesReport.reserveTarget).toBe(150); // 1500 * 10%
    expect(salesReport.actualHeldReserve).toBe(150);
    expect(salesReport.payableAmount).toBe(1350); // 1500 - 150
  });

  it('7. Buyer contact masking preserves privacy: name shown, email/phone masked (AC-64)', () => {
    expect(maskEmail('alice.wonderland@example.com')).toBe('al***@example.com');
    expect(maskEmail('me@domain.com')).toBe('m***@domain.com');
    expect(maskEmail('')).toBe('***');
    expect(maskEmail('invalid')).toBe('***');

    expect(maskPhone('0812345678')).toBe('081***5678');
    expect(maskPhone('0899998888')).toBe('089***8888');
    expect(maskPhone('')).toBe('***');
    expect(maskPhone('1234')).toBe('***');
  });
});
