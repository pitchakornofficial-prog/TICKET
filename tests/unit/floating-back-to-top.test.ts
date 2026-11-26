import { describe, expect, it } from 'vitest';
import { computeBackToTopOffset } from '@/components/floating-back-to-top';

describe('computeBackToTopOffset', () => {
  it('places the button 12px below desktop .site-header bottom', () => {
    expect(computeBackToTopOffset([88.2])).toBe(101);
  });

  it('clears wrapped mobile .site-header bottom', () => {
    expect(computeBackToTopOffset([125])).toBe(137);
  });

  it('clears the lowest active sticky bar when subnav is below header', () => {
    expect(computeBackToTopOffset([88, 142.4])).toBe(155);
  });

  it('returns null when no valid positive bottom positions exist', () => {
    expect(computeBackToTopOffset([])).toBeNull();
    expect(computeBackToTopOffset([0, null, undefined, Number.NaN])).toBeNull();
  });
});
