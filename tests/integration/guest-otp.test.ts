import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import {
  requestGuestOtp,
  verifyGuestOtp,
  getVerifiedGuestSession,
} from '../../src/server/guest-otp';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('Guest OTP verification and rate limiting integration (TASK-011, AC-57, AC-58, AC-59, AC-60)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('verifies 6-digit OTP within 5 minutes, enforces single-use replay prevention, and creates verified session', async () => {
    clearCapturedEmails();
    const baseTime = new Date('2026-11-01T10:00:00.000Z');
    const buyer = {
      name: 'กานต์ ทดสอบ',
      email: 'garn.test@ticket.invalid',
      phone: '0891234567',
    };

    // 1. Request OTP
    const reqRes = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: baseTime,
    });

    expect(reqRes.success).toBe(true);
    expect(reqRes.requestId).toBeDefined();
    const reqId = reqRes.requestId ?? '';

    // Verify email captured
    const emails = getCapturedEmails();
    expect(emails.length).toBeGreaterThan(0);
    const sentEmail = emails[emails.length - 1];
    expect(sentEmail.to).toBe(buyer.email);
    expect(sentEmail.subject).toContain('รหัส OTP');

    // Extract 6-digit OTP code from email text
    const match = sentEmail.text?.match(/\b(\d{6})\b/);
    expect(match).toBeTruthy();
    const code = match ? match[1] : '';

    // 2. Verify with wrong code -> fails
    const wrongRes = await verifyGuestOtp(fixture.pool, {
      email: buyer.email,
      code: '000000',
      requestId: reqId,
      purpose: 'checkout',
      buyer,
      now: new Date(baseTime.getTime() + 10000), // +10s
    });
    expect(wrongRes.success).toBe(false);
    expect(wrongRes.code).toBe('INVALID_CODE');

    // 3. Verify with correct code within 5 minutes -> succeeds (AC-57)
    const successRes = await verifyGuestOtp(fixture.pool, {
      email: buyer.email,
      code,
      requestId: reqId,
      purpose: 'checkout',
      buyer,
      now: new Date(baseTime.getTime() + 30000), // +30s
    });
    expect(successRes.success).toBe(true);
    expect(successRes.verifiedToken).toBeDefined();
    expect(successRes.buyer?.email).toBe(buyer.email);

    // 4. Verify replay is rejected (AC-57)
    const replayRes = await verifyGuestOtp(fixture.pool, {
      email: buyer.email,
      code,
      requestId: reqId,
      purpose: 'checkout',
      buyer,
      now: new Date(baseTime.getTime() + 40000), // +40s
    });
    expect(replayRes.success).toBe(false);
    expect(replayRes.code).toBe('REPLAY');

    // 5. Verify session retrieval
    const token = successRes.verifiedToken ?? '';
    const session = await getVerifiedGuestSession(fixture.pool, token);
    expect(session).not.toBeNull();
    expect(session?.email).toBe(buyer.email);
    expect(session?.name).toBe(buyer.name);
  });

  it('enforces 5-minute expiry with controlled clock (AC-57)', async () => {
    clearCapturedEmails();
    const baseTime = new Date('2026-11-01T11:00:00.000Z');
    const buyer = {
      name: 'หมดอายุ ทดสอบ',
      email: 'expired.test@ticket.invalid',
      phone: '0819876543',
    };

    const reqRes = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: baseTime,
    });
    expect(reqRes.success).toBe(true);
    const reqId = reqRes.requestId ?? '';

    const sentEmail = getCapturedEmails().at(-1);
    const match = sentEmail?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';

    // Attempt verify at 5 minutes + 1 second (301 seconds) -> expired
    const expiredRes = await verifyGuestOtp(fixture.pool, {
      email: buyer.email,
      code,
      requestId: reqId,
      purpose: 'checkout',
      buyer,
      now: new Date(baseTime.getTime() + 301000),
    });
    expect(expiredRes.success).toBe(false);
    expect(expiredRes.code).toBe('EXPIRED');
  });

  it('enforces 60-second cooldown and 5 requests per 15 minutes limit; new code invalidates older code (AC-58)', async () => {
    clearCapturedEmails();
    let currentTime = new Date('2026-11-01T12:00:00.000Z');
    const buyer = {
      name: 'คูลดาวน์ ทดสอบ',
      email: 'cooldown.test@ticket.invalid',
      phone: '0823456789',
    };

    // Request 1
    const req1 = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(req1.success).toBe(true);
    const req1Id = req1.requestId ?? '';
    const match1 = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code1 = match1 ? match1[1] : '';

    // Request 2 immediately (0s) -> rejected due to 60s cooldown
    const reqTooFast = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(reqTooFast.success).toBe(false);
    expect(reqTooFast.code).toBe('COOLDOWN');

    // Request 2 after 30s -> still rejected
    currentTime = new Date(currentTime.getTime() + 30000);
    const req30s = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(req30s.success).toBe(false);
    expect(req30s.code).toBe('COOLDOWN');

    // Request 2 after 61s -> succeeds
    currentTime = new Date(currentTime.getTime() + 35000); // total 65s
    const req2 = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(req2.success).toBe(true);

    // AC-58: Code 1 should now be invalidated by Code 2
    const verifyCode1 = await verifyGuestOtp(fixture.pool, {
      email: buyer.email,
      code: code1,
      requestId: req1Id,
      purpose: 'checkout',
      buyer,
      now: currentTime,
    });
    expect(verifyCode1.success).toBe(false);
    expect(verifyCode1.code).toBe('REPLAY'); // consumed by invalidation

    // Request 3 (at +70s from req2)
    currentTime = new Date(currentTime.getTime() + 70000);
    const req3 = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(req3.success).toBe(true);

    // Request 4 (at +70s)
    currentTime = new Date(currentTime.getTime() + 70000);
    const req4 = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(req4.success).toBe(true);

    // Request 5 (at +70s) - 5th request in window
    currentTime = new Date(currentTime.getTime() + 70000);
    const req5 = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(req5.success).toBe(true);

    // Request 6 (at +70s) - 6th request within 15 minutes -> RATE_LIMITED (AC-58)
    currentTime = new Date(currentTime.getTime() + 70000);
    const req6 = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(req6.success).toBe(false);
    expect(req6.code).toBe('RATE_LIMITED');
  });

  it('locks out verification for 15 minutes after 5 wrong attempts; requesting new code does not reset fail counter (AC-59)', async () => {
    clearCapturedEmails();
    let currentTime = new Date('2026-11-01T14:00:00.000Z');
    const buyer = {
      name: 'ลองผิด ทดสอบ',
      email: 'lockout.test@ticket.invalid',
      phone: '0856781234',
    };

    const req = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(req.success).toBe(true);
    const reqId = req.requestId ?? '';

    // Wrong attempts 1 to 4
    for (let i = 1; i <= 4; i++) {
      currentTime = new Date(currentTime.getTime() + 2000);
      const res = await verifyGuestOtp(fixture.pool, {
        email: buyer.email,
        code: `99999${i}`,
        requestId: reqId,
        buyer,
        now: currentTime,
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_CODE');
    }

    // 5th wrong attempt triggers 15-minute lockout (AC-59)
    currentTime = new Date(currentTime.getTime() + 2000);
    const fifthFail = await verifyGuestOtp(fixture.pool, {
      email: buyer.email,
      code: '888888',
      requestId: reqId,
      buyer,
      now: currentTime,
    });
    expect(fifthFail.success).toBe(false);
    expect(fifthFail.code).toBe('BLOCKED');

    // Further attempt during lockout is BLOCKED
    currentTime = new Date(currentTime.getTime() + 60000); // +1 min
    const blockedCheck = await verifyGuestOtp(fixture.pool, {
      email: buyer.email,
      code: '123456',
      requestId: reqId,
      buyer,
      now: currentTime,
    });
    expect(blockedCheck.success).toBe(false);
    expect(blockedCheck.code).toBe('BLOCKED');

    // Requesting a new code during lockout does NOT reset the fail counter!
    currentTime = new Date(currentTime.getTime() + 70000);
    const newReqDuringLockout = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(newReqDuringLockout.success).toBe(false);
    expect(newReqDuringLockout.code).toBe('BLOCKED');

    // After 15 minutes lockout expires, user is unblocked
    currentTime = new Date(currentTime.getTime() + 900000); // +15 min
    const unblockedReq = await requestGuestOtp(fixture.pool, { buyer, now: currentTime });
    expect(unblockedReq.success).toBe(true);
  });
});
