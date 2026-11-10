import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { POST as directSessionHandler } from '../../src/app/api/public/checkout/direct-session/route';

describe('D-272: Streamlined Direct Guest Checkout Without OTP Verification', () => {
  const rootDir = resolve(__dirname, '../..');

  it('records D-272 in docs/requirement.md with agreed details and zero emojis', () => {
    const requirementContent = readFileSync(
      resolve(rootDir, 'docs/requirement.md'),
      'utf-8',
    );
    expect(requirementContent).toContain('D-272');
    expect(requirementContent).toContain('Streamlined Direct Guest Checkout Without OTP Verification');
    expect(requirementContent).toContain('นำขั้นตอนและหน้าต่างยืนยันรหัส OTP');
    expect(requirementContent).toContain('ยืนยันและไปหน้าชำระเงิน');

    const d272Line = requirementContent
      .split('\n')
      .find(line => line.includes('D-272')) || '';
    expect(d272Line).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('validates buyer info in /api/public/checkout/direct-session route', async () => {
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

  it('verifies that GuestCheckoutEntry submits directly to payment without OTP modal', () => {
    const guestEntrySrc = readFileSync(
      resolve(rootDir, 'src/components/guest-checkout-entry.tsx'),
      'utf-8',
    );

    // Direct submit call to direct-session
    expect(guestEntrySrc).toContain('/api/public/checkout/direct-session');
    expect(guestEntrySrc).toContain('handleDirectCheckout');
    expect(guestEntrySrc).toContain('ยืนยันและไปหน้าชำระเงิน');

    // Retains backward contract strings
    expect(guestEntrySrc).toContain('pdpa-consent-checkbox');
    expect(guestEntrySrc).toContain('autoProceed?: boolean');
    expect(guestEntrySrc).toContain('onVerified(buyerInfo, data.buyerQuota, true)');

    // Zero Emojis (D-14)
    expect(guestEntrySrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
