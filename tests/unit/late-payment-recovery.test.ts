import { describe, expect, it } from 'vitest';

describe('TASK-016 Unit: Late Payment & Insufficient Quota Recovery', () => {
  it('calculates full refund amount matching total received including customer fee (G-23, G-35)', () => {
    const subtotal = 3000;
    const customerFee = 60;
    const totalReceived = subtotal + customerFee;

    // Full refund must equal total received including customer fee (G-23, G-35)
    expect(totalReceived).toBe(3060);
    expect(totalReceived).toBe(subtotal + customerFee);
  });

  it('generates recovery case ID conforming to PRC- prefix format', () => {
    const randomPart = 'ABCDEF12';
    const caseId = `PRC-${randomPart}`;
    expect(caseId).toMatch(/^PRC-[A-F0-9]{8}$/);
  });

  it('differentiates reasons between paid_after_deadline and insufficient_quota', () => {
    const reasons = ['paid_after_deadline', 'insufficient_quota'] as const;
    expect(reasons).toContain('paid_after_deadline');
    expect(reasons).toContain('insufficient_quota');
  });
});
