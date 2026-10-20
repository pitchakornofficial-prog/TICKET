import { describe, expect, it } from 'vitest';
import { formatBaht, formatDate, formatTime, locale, timeZone } from '../../src/lib/locale.ts';

describe('Public catalog formatting and locale (TASK-007, G-47)', () => {
  it('formats dates in Thai locale and Asia/Bangkok time zone', () => {
    expect(locale).toBe('th-TH');
    expect(timeZone).toBe('Asia/Bangkok');

    // 2026-11-15T19:00:00+07:00
    const sampleDate = new Date('2026-11-15T12:00:00Z');
    const formatted = formatDate(sampleDate);
    expect(formatted).toContain('พฤศจิกายน');
    expect(formatted).toContain('2569');

    const formattedTime = formatTime(sampleDate);
    expect(formattedTime).toBe('19:00');
  });

  it('formats prices in Thai Baht (THB) currency', () => {
    expect(formatBaht(1500)).toBe('฿1,500.00');
    expect(formatBaht(0)).toBe('฿0.00');
    expect(formatBaht(3250.5)).toBe('฿3,250.50');
  });
});
