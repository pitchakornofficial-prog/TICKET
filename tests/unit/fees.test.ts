import { describe, expect, it } from 'vitest';
import {
  roundHalfUp,
  calculateCustomerFee,
  calculateOrganizerOrderFee,
  calculateReserveTarget,
} from '../../src/server/fees';

describe('Fee calculations and rounding contract (AC-23, AC-24, AC-25, AC-29)', () => {
  describe('roundHalfUp (R(x) rounding contract G-26)', () => {
    it('rounds 10.005 half-up to 10.01', () => {
      expect(roundHalfUp(10.005)).toBe(10.01);
      expect(roundHalfUp('10.005')).toBe(10.01);
    });

    it('rounds 10.004 half-up to 10.00', () => {
      expect(roundHalfUp(10.004)).toBe(10.00);
      expect(roundHalfUp('10.004')).toBe(10.00);
    });

    it('handles negative values correctly', () => {
      expect(roundHalfUp(-10.005)).toBe(-10.01);
      expect(roundHalfUp(-10.004)).toBe(-10.00);
    });

    it('handles zero and integers', () => {
      expect(roundHalfUp(0)).toBe(0);
      expect(roundHalfUp(100)).toBe(100);
    });
  });

  describe('calculateCustomerFee (AC-24, G-25)', () => {
    // Fixture from SPEC-001 line 247:
    // B = 2*500 + 1*800 = 1,800; customer mode 20 บาท/ใบ (N=3)
    // Fee = 60, total = 1,860
    it('calculates per_ticket mode: R(a * N)', () => {
      const { fee, total } = calculateCustomerFee('per_ticket', 20, 3, 1800);
      expect(fee).toBe(60);
      expect(total).toBe(1860);
    });

    // Fixture from SPEC-001 line 248:
    // B = 1,800; customer mode 30 บาท/order
    // Fee = 30, total = 1,830
    it('calculates per_order mode: R(b)', () => {
      const { fee, total } = calculateCustomerFee('per_order', 30, 3, 1800);
      expect(fee).toBe(30);
      expect(total).toBe(1830);
    });

    // Fixture from SPEC-001 line 249:
    // B = 1,800; customer mode 2.5%
    // Fee = 45, total = 1,845
    it('calculates percentage mode: R(B * c / 100)', () => {
      const { fee, total } = calculateCustomerFee('percentage', 2.5, 3, 1800);
      expect(fee).toBe(45);
      expect(total).toBe(1845);
    });

    it('rejects negative rates or quantities', () => {
      expect(() => calculateCustomerFee('per_ticket', -10, 1, 100)).toThrow();
      expect(() => calculateCustomerFee('per_ticket', 10, -1, 100)).toThrow();
      expect(() => calculateCustomerFee('per_ticket', 10, 1, -100)).toThrow();
    });
  });

  describe('calculateOrganizerOrderFee (AC-23, G-48, G-49)', () => {
    // Fixture from SPEC-001 line 251:
    // Two orders with V_o = 100.10 each; organizer 5%
    // F_o = 5.01 per order, F = 10.02 (not rounding sum of bases first)
    it('calculates per-order percentage fee with half-up rounding: F_o = R(V_o * r / 100)', () => {
      const feeOrder1 = calculateOrganizerOrderFee('percentage', 5, 1, 100.1);
      const feeOrder2 = calculateOrganizerOrderFee('percentage', 5, 1, 100.1);
      expect(feeOrder1).toBe(5.01);
      expect(feeOrder2).toBe(5.01);
      expect(roundHalfUp(feeOrder1 + feeOrder2)).toBe(10.02);
    });

    it('calculates per_ticket mode: F_o = R(n_o * a)', () => {
      const fee = calculateOrganizerOrderFee('per_ticket', 25, 4, 1000);
      expect(fee).toBe(100);
    });

    it('returns 0 per order for flat_fee (flat fee is assessed once per event)', () => {
      const fee = calculateOrganizerOrderFee('flat_fee', 10000, 4, 1000);
      expect(fee).toBe(0);
    });
  });

  describe('calculateReserveTarget (AC-29, G-30)', () => {
    // Formula: R(max(E, 0) * s / 100)
    // Fixture from SPEC-001 line 270: E = 900, s = 10% -> 90
    it('calculates reserve target correctly from net entitlement and percentage', () => {
      expect(calculateReserveTarget(900, 10)).toBe(90);
    });

    it('clamps negative entitlement to zero without creating negative reserve', () => {
      expect(calculateReserveTarget(-360, 10)).toBe(0);
    });

    it('rejects reserve percentage outside 0-100', () => {
      expect(() => calculateReserveTarget(1000, -1)).toThrow();
      expect(() => calculateReserveTarget(1000, 101)).toThrow();
    });
  });
});
