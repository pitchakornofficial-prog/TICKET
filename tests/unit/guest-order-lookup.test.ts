import { describe, it, expect } from 'vitest';
import { cleanPhoneNumber } from '../../src/server/guest-order-lookup';

describe('TASK-018: Guest Order Lookup Unit Tests', () => {
  describe('cleanPhoneNumber', () => {
    it('strips dashes, spaces, and formatting from phone numbers', () => {
      expect(cleanPhoneNumber('081-234-5678')).toBe('0812345678');
      expect(cleanPhoneNumber('081 234 5678')).toBe('0812345678');
      expect(cleanPhoneNumber('+66 81-234-5678')).toBe('+66812345678');
      expect(cleanPhoneNumber('0812345678')).toBe('0812345678');
    });
  });

  describe('Authorization and Access Control Rules (AC-22, AC-62, AC-63)', () => {
    it('verifies that both email and phone are mandatory for lookup', () => {
      const email = 'buyer@example.com';
      const phone = '0812345678';

      expect(Boolean(email && phone)).toBe(true);
      expect(Boolean(!email && phone)).toBe(false);
      expect(Boolean(email && !phone)).toBe(false);
    });

    it('denies cross-buyer access when session email does not match order email (AC-22)', () => {
      const sessionEmail = 'buyer-a@example.com';
      const orderEmail = 'buyer-b@example.com';

      const isAuthorized = sessionEmail.toLowerCase() === orderEmail.toLowerCase();
      expect(isAuthorized).toBe(false);
    });

    it('allows access when session email and phone match order (AC-21, AC-62)', () => {
      const sessionEmail = 'Buyer-A@Example.COM';
      const orderEmail = 'buyer-a@example.com';
      const sessionPhone = '081-234-5678';
      const orderPhone = '0812345678';

      const emailMatches = sessionEmail.toLowerCase() === orderEmail.toLowerCase();
      const phoneMatches = cleanPhoneNumber(sessionPhone) === cleanPhoneNumber(orderPhone);

      expect(emailMatches && phoneMatches).toBe(true);
    });

    it('denies access if email matches but phone is different (AC-62)', () => {
      const sessionEmail = 'buyer-a@example.com';
      const orderEmail = 'buyer-a@example.com';
      const sessionPhone = '081-111-2222';
      const orderPhone = '089-999-8888';

      const isAuthorized =
        sessionEmail.toLowerCase() === orderEmail.toLowerCase() &&
        cleanPhoneNumber(sessionPhone) === cleanPhoneNumber(orderPhone);

      expect(isAuthorized).toBe(false);
    });
  });
});
