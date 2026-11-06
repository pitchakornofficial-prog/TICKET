import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('Issue #7: Real PostgreSQL Concurrency Tests (AC-57, AC-59)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('guarantees exactly ONE session when 10 concurrent requests verify the same OTP simultaneously (AC-57)', async () => {
    clearCapturedEmails();
    const baseTime = new Date('2026-11-01T14:00:00.000Z');
    const buyer = {
      name: 'เรซ คอนดิชัน',
      email: 'race.single.use@ticket.invalid',
      phone: '0811112222',
    };

    // 1. Request OTP
    const reqRes = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: baseTime,
    });
    expect(reqRes.success).toBe(true);
    const reqId = reqRes.requestId ?? '';

    // Extract code from captured email
    const emails = getCapturedEmails();
    const sentEmail = emails[emails.length - 1];
    const match = sentEmail.text?.match(/\b(\d{6})\b/);
    expect(match).toBeTruthy();
    const code = match ? match[1] : '';

    // 2. Launch 10 simultaneous verification requests with the SAME valid code
    const concurrentRequests = Array.from({ length: 10 }, () =>
      verifyGuestOtp(fixture.pool, {
        email: buyer.email,
        code,
        requestId: reqId,
        purpose: 'checkout',
        buyer,
        now: new Date(baseTime.getTime() + 10000),
      }),
    );

    const results = await Promise.all(concurrentRequests);

    const successful = results.filter(r => r.success === true);
    const replayed = results.filter(r => r.success === false && r.code === 'REPLAY');

    // Exactly 1 must succeed, exactly 9 must be rejected as REPLAY
    expect(successful.length).toBe(1);
    expect(replayed.length).toBe(9);

    // 3. Verify that only 1 session was created in database
    const sessionRes = await fixture.pool.query(
      'SELECT token FROM guest_verified_sessions WHERE email = $1',
      [buyer.email],
    );
    expect(sessionRes.rowCount).toBe(1);
    expect(sessionRes.rows[0].token).toBe(successful[0].verifiedToken);
  });

  it('locks out verification without losing updates when 10 concurrent wrong guesses are submitted (AC-59)', async () => {
    clearCapturedEmails();
    const baseTime = new Date('2026-11-01T15:00:00.000Z');
    const buyer = {
      name: 'คนร้าย เดารหัส',
      email: 'brute.force.race@ticket.invalid',
      phone: '0899998888',
    };

    // 1. Request OTP
    const reqRes = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: baseTime,
    });
    expect(reqRes.success).toBe(true);
    const reqId = reqRes.requestId ?? '';

    const sentEmail = getCapturedEmails().at(-1);
    const match = sentEmail?.text?.match(/\b(\d{6})\b/);
    const correctCode = match ? match[1] : '';

    // 2. Send 10 concurrent wrong guesses
    const wrongGuesses = Array.from({ length: 10 }, (_, i) =>
      verifyGuestOtp(fixture.pool, {
        email: buyer.email,
        code: `99999${i}`, // wrong codes
        requestId: reqId,
        purpose: 'checkout',
        buyer,
        now: new Date(baseTime.getTime() + 10000),
      }),
    );

    const results = await Promise.all(wrongGuesses);

    // All 10 must fail
    expect(results.every(r => r.success === false)).toBe(true);

    const blocked = results.filter(r => r.code === 'BLOCKED');
    const invalidCode = results.filter(r => r.code === 'INVALID_CODE');

    // At least 5 requests should be BLOCKED because lockout occurs at attempt 5
    expect(blocked.length).toBeGreaterThanOrEqual(5);
    expect(invalidCode.length).toBeLessThanOrEqual(5);

    // 3. Check database tracking record
    const trackRes = await fixture.pool.query(
      'SELECT "failCount", "blockedUntil" FROM guest_otp_tracking WHERE key = $1',
      [`${buyer.email}:checkout`],
    );
    expect(trackRes.rowCount).toBe(1);
    expect(trackRes.rows[0].failCount).toBe(5);
    expect(trackRes.rows[0].blockedUntil).not.toBeNull();

    // 4. An 11th request with the CORRECT code must still be blocked due to lockout
    const attemptWithCorrectCode = await verifyGuestOtp(fixture.pool, {
      email: buyer.email,
      code: correctCode,
      requestId: reqId,
      purpose: 'checkout',
      buyer,
      now: new Date(baseTime.getTime() + 15000),
    });
    expect(attemptWithCorrectCode.success).toBe(false);
    expect(attemptWithCorrectCode.code).toBe('BLOCKED');
  });
});
