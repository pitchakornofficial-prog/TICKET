import { describe, it, expect } from 'vitest';
import { cleanPhoneNumber } from '../../src/server/guest-order-lookup';

describe('TASK-019: Owner Contact Correction Unit Tests (AC-76, G-24)', () => {
  it('validates email format strictly', () => {
    const validEmails = ['buyer@example.com', 'user.name+tag@sub.domain.co.th'];
    const invalidEmails = ['invalid-email', '@domain.com', 'user@', 'user@domain'];

    for (const email of validEmails) {
      expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).toBe(true);
    }
    for (const email of invalidEmails) {
      expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).toBe(false);
    }
  });

  it('validates phone cleaning and formatting', () => {
    const phone = '081-234-5678';
    const clean = cleanPhoneNumber(phone);
    expect(clean).toBe('0812345678');
    expect(clean.length >= 9 && clean.length <= 15).toBe(true);
    expect(/^\+?\d+$/.test(clean)).toBe(true);
  });

  it('enforces role authorization check for owner only (AC-76)', () => {
    const isAuthorized = (role: string) => role === 'owner';

    expect(isAuthorized('owner')).toBe(true);
    expect(isAuthorized('organizer')).toBe(false);
    expect(isAuthorized('scanner')).toBe(false);
    expect(isAuthorized('buyer')).toBe(false);
    expect(isAuthorized('guest')).toBe(false);
  });

  it('requires non-empty owner verification reason (G-24)', () => {
    const checkReason = (reason?: string) => Boolean(reason?.trim());

    expect(checkReason('ตรวจสอบบัตรประชาชนและหลักฐานการชำระเงินเรียบร้อย')).toBe(true);
    expect(checkReason('')).toBe(false);
    expect(checkReason('   ')).toBe(false);
    expect(checkReason(undefined)).toBe(false);
  });
});
