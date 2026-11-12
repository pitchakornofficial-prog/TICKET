import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { POST as directSessionHandler } from '../../src/app/api/public/checkout/direct-session/route';

describe('Checkout OTP Restoration & Production Direct-Session Guard (Supersedes D-272)', () => {
  const rootDir = resolve(__dirname, '../..');

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('records D-272 supersession in docs/requirement.md with zero emojis', () => {
    const requirementContent = readFileSync(
      resolve(rootDir, 'docs/requirement.md'),
      'utf-8',
    );
    expect(requirementContent).toContain('D-272');
    expect(requirementContent).toContain('Superseded 2026-11-12');
    expect(requirementContent).toContain('ยืนยันและไปหน้าชำระเงิน');

    const d272Line = requirementContent
      .split('\n')
      .find(line => line.includes('D-272')) || '';
    expect(d272Line).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('blocks /api/public/checkout/direct-session in production with 403 OTP_REQUIRED', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const prodRes = await directSessionHandler(new Request('http://localhost/api/public/checkout/direct-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'สมชาย ใจดี', email: 'somchai@example.com', phone: '0812345678' }),
    }));
    expect(prodRes.status).toBe(403);
    const prodData = await prodRes.json();
    expect(prodData.code).toBe('OTP_REQUIRED');
  });

  it('still validates buyer info in /api/public/checkout/direct-session when called outside production', async () => {
    // Missing/invalid name
    const res1 = await directSessionHandler(new Request('http://localhost/api/public/checkout/direct-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'test@example.com', phone: '0812345678' }),
    }));
    expect(res1.status).toBe(400);

    // Invalid email
    const res2 = await directSessionHandler(new Request('http://localhost/api/public/checkout/direct-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'สมชาย ใจดี', email: 'invalid-email', phone: '0812345678' }),
    }));
    expect(res2.status).toBe(400);

    // Valid buyer info
    const res3 = await directSessionHandler(new Request('http://localhost/api/public/checkout/direct-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'สมชาย ใจดี', email: 'somchai@example.com', phone: '0812345678' }),
    }));
    expect(res3.status).toBe(200);
    const data3 = await res3.json();
    expect(data3.success).toBe(true);
    expect(data3.verifiedToken).toBeDefined();
    expect(data3.buyer.email).toBe('somchai@example.com');
  });

  it('verifies that GuestCheckoutEntry enforces request-otp and verify-otp modal before payment', () => {
    const guestEntrySrc = readFileSync(
      resolve(rootDir, 'src/components/guest-checkout-entry.tsx'),
      'utf-8',
    );

    expect(guestEntrySrc).toContain('/api/public/checkout/request-otp');
    expect(guestEntrySrc).toContain('/api/public/checkout/verify-otp');
    expect(guestEntrySrc).not.toContain('/api/public/checkout/direct-session');
    expect(guestEntrySrc).toContain('ขอรหัส OTP เพื่อซื้อบัตร');
    expect(guestEntrySrc).toContain('ยืนยันและไปหน้าชำระเงิน');

    // Retains backward contract strings
    expect(guestEntrySrc).toContain('pdpa-consent-checkbox');
    expect(guestEntrySrc).toContain('autoProceed?: boolean');
    expect(guestEntrySrc).toContain('onVerified(buyerInfo, data.buyerQuota, true)');

    // Zero Emojis (D-14)
    expect(guestEntrySrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
