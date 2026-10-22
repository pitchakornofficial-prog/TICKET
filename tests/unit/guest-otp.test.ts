import { describe, expect, it } from 'vitest';
import {
  validateBuyerDetails,
  OTP_EXPIRATION_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_REQUESTS_IN_WINDOW,
  OTP_MAX_FAILS_IN_WINDOW,
  OTP_LOCKOUT_SECONDS,
} from '../../src/server/guest-otp';

describe('Guest checkout validation and OTP security parameters (TASK-011, AC-57, AC-58, AC-59, AC-60)', () => {
  describe('validateBuyerDetails (AC-60: checkout requires name, email, phone)', () => {
    it('rejects when name is missing or empty', () => {
      const res = validateBuyerDetails({ email: 'guest@example.com', phone: '0812345678' });
      expect(res.valid).toBe(false);
      expect(res.error).toBe('กรุณากรอกชื่อ-นามสกุล');
    });

    it('rejects when email is missing or empty', () => {
      const res = validateBuyerDetails({ name: 'สมชาย ใจดี', phone: '0812345678' });
      expect(res.valid).toBe(false);
      expect(res.error).toBe('กรุณากรอกอีเมล');
    });

    it('rejects invalid email formats', () => {
      const res = validateBuyerDetails({ name: 'สมชาย ใจดี', email: 'invalid-email', phone: '0812345678' });
      expect(res.valid).toBe(false);
      expect(res.error).toBe('รูปแบบอีเมลไม่ถูกต้อง');
    });

    it('rejects when phone is missing or empty', () => {
      const res = validateBuyerDetails({ name: 'สมชาย ใจดี', email: 'guest@example.com' });
      expect(res.valid).toBe(false);
      expect(res.error).toBe('กรุณากรอกเบอร์โทรศัพท์');
    });

    it('rejects invalid phone numbers', () => {
      const res = validateBuyerDetails({ name: 'สมชาย ใจดี', email: 'guest@example.com', phone: 'abc' });
      expect(res.valid).toBe(false);
      expect(res.error).toBe('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง');
    });

    it('accepts and normalizes valid buyer details', () => {
      const res = validateBuyerDetails({
        name: '  สมชาย ใจดี  ',
        email: '  GUEST@Example.Com  ',
        phone: ' 081-234-5678 ',
      });
      expect(res.valid).toBe(true);
      expect(res.data).toEqual({
        name: 'สมชาย ใจดี',
        email: 'guest@example.com',
        phone: '0812345678',
      });
    });
  });

  describe('Security parameters (ADR-0004 & SPEC-001)', () => {
    it('has 5-minute (300s) OTP expiration (AC-57)', () => {
      expect(OTP_EXPIRATION_SECONDS).toBe(300);
    });

    it('has 60-second resend cooldown (AC-58)', () => {
      expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
    });

    it('has maximum 5 requests in 15 minutes window (AC-58)', () => {
      expect(OTP_MAX_REQUESTS_IN_WINDOW).toBe(5);
    });

    it('has 5 maximum wrong attempts before 15-minute lockout (AC-59)', () => {
      expect(OTP_MAX_FAILS_IN_WINDOW).toBe(5);
      expect(OTP_LOCKOUT_SECONDS).toBe(900);
    });
  });
});
