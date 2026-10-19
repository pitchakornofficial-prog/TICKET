import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture, fixtureAccounts } from '../support/auth-fixture';
import { handleAuthRequest } from '../../src/server/auth-http';
import { checkAndRecordResetRequest } from '../../src/server/password-reset';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('password reset integration flow and rate limits', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';
  let nextIp = 500;

  function makeRequest(path: string, body?: unknown, origin = baseURL) {
    return new Request(`${baseURL}/api/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'x-forwarded-for': `192.0.2.${nextIp++}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('provides a generic response regardless of whether the email exists', async () => {
    clearCapturedEmails();
    // Non-existent email
    const req1 = makeRequest('request-password-reset', { email: 'nonexistent@ticket.invalid' });
    const res1 = await handleAuthRequest(fixture.auth, req1);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.message).toBe('หากอีเมลนี้มีอยู่ในระบบ ลิงก์ตั้งรหัสผ่านใหม่จะถูกส่งไปยังอีเมลของคุณ');
    expect(getCapturedEmails()).toHaveLength(0);

    // Existing email
    const req2 = makeRequest('request-password-reset', { email: fixtureAccounts.owner.email });
    const res2 = await handleAuthRequest(fixture.auth, req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.message).toBe('หากอีเมลนี้มีอยู่ในระบบ ลิงก์ตั้งรหัสผ่านใหม่จะถูกส่งไปยังอีเมลของคุณ');
    expect(getCapturedEmails()).toHaveLength(1);
    expect(getCapturedEmails()[0].to).toBe(fixtureAccounts.owner.email);
  });

  it('enforces 60-second cooldown and max 3 requests per 15 minutes', async () => {
    const t0 = new Date('2026-10-20T10:00:00.000Z');
    const email = fixtureAccounts.organizer.email;

    // 1st request at t0: allowed
    const r1 = await checkAndRecordResetRequest(fixture.pool, email, t0);
    expect(r1.allowed).toBe(true);

    // Request at t0 + 30s: rejected by 60s cooldown
    const t1 = new Date(t0.getTime() + 30 * 1000);
    const r2 = await checkAndRecordResetRequest(fixture.pool, email, t1);
    expect(r2.allowed).toBe(false);
    expect(r2.reason).toBe('cooldown');

    // 2nd request at t0 + 70s: allowed (cooldown passed)
    const t2 = new Date(t0.getTime() + 70 * 1000);
    const r3 = await checkAndRecordResetRequest(fixture.pool, email, t2);
    expect(r3.allowed).toBe(true);

    // 3rd request at t0 + 140s: allowed
    const t3 = new Date(t0.getTime() + 140 * 1000);
    const r4 = await checkAndRecordResetRequest(fixture.pool, email, t3);
    expect(r4.allowed).toBe(true);

    // 4th request at t0 + 210s: rejected (limit 3 per 15m reached)
    const t4 = new Date(t0.getTime() + 210 * 1000);
    const r5 = await checkAndRecordResetRequest(fixture.pool, email, t4);
    expect(r5.allowed).toBe(false);
    expect(r5.reason).toBe('max_limit');

    // Request at t0 + 18m: allowed (new 15m window after t3 at 140s)
    const t5 = new Date(t0.getTime() + 18 * 60 * 1000);
    const r6 = await checkAndRecordResetRequest(fixture.pool, email, t5);
    expect(r6.allowed).toBe(true);
  });

  it('reissuing a reset link replaces older active links and allows reset only once', async () => {
    clearCapturedEmails();
    const email = fixtureAccounts.scanner.email;

    // Clear any previous rate limit for scanner to test reissue
    await fixture.pool.query('DELETE FROM auth_rate_limit WHERE key = $1', [`reset_pwd:${fixture.ids.scanner}`]);

    // Request 1
    const req1 = makeRequest('request-password-reset', { email });
    await handleAuthRequest(fixture.auth, req1);
    expect(getCapturedEmails()).toHaveLength(1);
    const email1 = getCapturedEmails()[0].text || '';
    const match1 = email1.match(/\/api\/auth\/reset-password\/([A-Za-z0-9_-]+)/);
    expect(match1).not.toBeNull();
    const token1 = match1?.[1] || '';

    // Clear rate limit to simulate valid later reissue
    await fixture.pool.query('DELETE FROM auth_rate_limit WHERE key = $1', [`reset_pwd:${fixture.ids.scanner}`]);

    // Request 2 (reissue)
    const req2 = makeRequest('request-password-reset', { email });
    await handleAuthRequest(fixture.auth, req2);
    expect(getCapturedEmails()).toHaveLength(2);
    const email2 = getCapturedEmails()[1].text || '';
    const match2 = email2.match(/\/api\/auth\/reset-password\/([A-Za-z0-9_-]+)/);
    expect(match2).not.toBeNull();
    const token2 = match2?.[1] || '';

    expect(token1).not.toBe(token2);

    // Old token1 should be invalidated by the reissue
    const oldResetReq = makeRequest('reset-password', {
      token: token1,
      newPassword: 'BrandNewPassword!003',
    });
    const oldRes = await handleAuthRequest(fixture.auth, oldResetReq);
    expect(oldRes.status).toBeGreaterThanOrEqual(400);

    // New token2 succeeds
    const newResetReq = makeRequest('reset-password', {
      token: token2,
      newPassword: 'BrandNewPassword!003',
    });
    const newRes = await handleAuthRequest(fixture.auth, newResetReq);
    expect(newRes.status).toBe(200);

    // Replay of token2 fails (one-time use)
    const replayReq = makeRequest('reset-password', {
      token: token2,
      newPassword: 'AnotherPassword!003',
    });
    const replayRes = await handleAuthRequest(fixture.auth, replayReq);
    expect(replayRes.status).toBeGreaterThanOrEqual(400);

    // Verification table should have 0 tokens left for this user
    const remaining = await fixture.pool.query(
      'SELECT * FROM auth_verification WHERE value = $1',
      [fixture.ids.scanner],
    );
    expect(remaining.rowCount).toBe(0);
  });
});
