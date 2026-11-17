import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture, fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { handleAuthRequest } from '../../src/server/auth-http';
import {
  createOrganizerInvitation,
  verifyInvitation,
  acceptOrganizerInvitation,
  INVITATION_EXPIRATION_SECONDS,
} from '../../src/server/invitation';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('organizer invitation integration flow and role boundary', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';
  let nextIp = 600;

  function makeRequest(path: string, body?: unknown, headers: Record<string, string> = {}) {
    return new Request(`${baseURL}/api/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: baseURL,
        'x-forwarded-for': `192.0.2.${nextIp++}`,
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  function createTestInvitation(email: string, now: Date) {
    return createOrganizerInvitation(fixture.pool, email, baseURL, now, 'organizer', {
      userId: fixture.ids.owner,
      name: fixtureAccounts.owner.name,
      email: fixtureAccounts.owner.email,
    });
  }

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('rejects public self-signup without invitation', async () => {
    const signupReq = makeRequest('sign-up/email', {
      email: 'self-signup@ticket.invalid',
      password: fixturePassword,
      name: 'พยายามสมัครเอง',
    });
    const signupRes = await handleAuthRequest(fixture.auth, signupReq);
    expect(signupRes.status).toBe(404);
  });

  it('only owner can issue organizer invitation', async () => {
    // 1. Unauthenticated request
    const unauthReq = makeRequest('invite-organizer', { email: 'new-org1@ticket.invalid' });
    const unauthRes = await handleAuthRequest(fixture.auth, unauthReq);
    expect(unauthRes.status).toBe(403);

    // 2. Organizer tries to invite another organizer
    const orgSignInReq = makeRequest('sign-in/email', {
      email: fixtureAccounts.organizer.email,
      password: fixturePassword,
    });
    const orgSignInRes = await handleAuthRequest(fixture.auth, orgSignInReq);
    const orgCookie = orgSignInRes.headers.get('set-cookie') || '';

    const orgInviteReq = makeRequest('invite-organizer', { email: 'new-org2@ticket.invalid' }, { Cookie: orgCookie });
    const orgInviteRes = await handleAuthRequest(fixture.auth, orgInviteReq);
    expect(orgInviteRes.status).toBe(403);

    // 3. Owner successfully invites organizer
    const ownerSignInReq = makeRequest('sign-in/email', {
      email: fixtureAccounts.owner.email,
      password: fixturePassword,
    });
    const ownerSignInRes = await handleAuthRequest(fixture.auth, ownerSignInReq);
    const ownerCookie = ownerSignInRes.headers.get('set-cookie') || '';

    clearCapturedEmails();
    const ownerInviteReq = makeRequest('invite-organizer', { email: 'new-org3@ticket.invalid' }, { Cookie: ownerCookie });
    const ownerInviteRes = await handleAuthRequest(fixture.auth, ownerInviteReq);
    expect(ownerInviteRes.status).toBe(200);
    const inviteJson = await ownerInviteRes.json();
    expect(inviteJson.message).toBe('ส่งคำเชิญสำเร็จ');
    expect(getCapturedEmails()).toHaveLength(1);
    expect(getCapturedEmails()[0].to).toBe('new-org3@ticket.invalid');

    const missingPassword = await handleAuthRequest(fixture.auth, makeRequest('invite-organizer', {
      email: 'new-owner-missing@ticket.invalid',
      role: 'owner',
    }, { Cookie: ownerCookie }));
    expect(missingPassword.status).toBe(400);

    const wrongPassword = await handleAuthRequest(fixture.auth, makeRequest('invite-organizer', {
      email: 'new-owner-wrong@ticket.invalid',
      role: 'owner',
      confirmPassword: 'Wrong-password!002',
    }, { Cookie: ownerCookie }));
    expect(wrongPassword.status).toBe(403);

    const ownerInvitation = await handleAuthRequest(fixture.auth, makeRequest('invite-organizer', {
      email: 'new-owner-valid@ticket.invalid',
      role: 'owner',
      confirmPassword: fixturePassword,
    }, { Cookie: ownerCookie }));
    expect(ownerInvitation.status).toBe(200);
    const ownerAudit = await fixture.pool.query(
      `SELECT "invitedRole", "issuedByUserId" FROM invitation_audit_logs
       WHERE "invitedEmail" = $1`,
      ['new-owner-valid@ticket.invalid'],
    );
    expect(ownerAudit.rows).toEqual([{ invitedRole: 'owner', issuedByUserId: fixture.ids.owner }]);
  });

  it('enforces 48-hour expiration and one-time use', async () => {
    const t0 = new Date('2026-10-20T10:00:00.000Z');
    const email = 'expiry-test@ticket.invalid';
    const inv = await createTestInvitation(email, t0);

    // Check before 48h: valid
    const check1 = await verifyInvitation(fixture.pool, inv.token, new Date(t0.getTime() + 47 * 3600 * 1000));
    expect(check1.valid).toBe(true);
    expect(check1.email).toBe(email);

    // Check after 48h + 1s: expired
    const checkExpired = await verifyInvitation(
      fixture.pool,
      inv.token,
      new Date(t0.getTime() + (INVITATION_EXPIRATION_SECONDS + 1) * 1000),
    );
    expect(checkExpired.valid).toBe(false);
    expect(checkExpired.reason).toBe('expired');

    // Attempt accept after expiry should throw
    await expect(
      acceptOrganizerInvitation(
        fixture.pool,
        inv.token,
        { name: 'ผู้จัดงานหมดอายุ', password: 'Password!004Expires' },
        new Date(t0.getTime() + (INVITATION_EXPIRATION_SECONDS + 1) * 1000),
      ),
    ).rejects.toThrow('คำเชิญนี้หมดอายุแล้ว');

    // Within validity window: successfully accept
    const user = await acceptOrganizerInvitation(
      fixture.pool,
      inv.token,
      { name: 'ผู้จัดงานผ่านสิทธิ์', password: 'Password!004Accepted' },
      new Date(t0.getTime() + 1000),
    );
    expect(user.role).toBe('organizer');
    expect(user.email).toBe(email);

    // Second accept of used token should fail
    const checkUsed = await verifyInvitation(fixture.pool, inv.token, new Date(t0.getTime() + 2000));
    expect(checkUsed.valid).toBe(false);
    expect(checkUsed.reason).toBe('used');

    await expect(
      acceptOrganizerInvitation(
        fixture.pool,
        inv.token,
        { name: 'ผู้จัดงานใช้ซ้ำ', password: 'Password!004Accepted' },
        new Date(t0.getTime() + 2000),
      ),
    ).rejects.toThrow('คำเชิญนี้ถูกใช้งานไปแล้ว');
  });

  it('reissuing an invitation invalidates older active invitation for the same email', async () => {
    const t0 = new Date('2026-10-20T10:00:00.000Z');
    const email = 'reissue-test@ticket.invalid';

    // Invitation 1
    const inv1 = await createTestInvitation(email, t0);
    expect((await verifyInvitation(fixture.pool, inv1.token, t0)).valid).toBe(true);

    // Invitation 2 (reissue)
    const inv2 = await createTestInvitation(email, new Date(t0.getTime() + 60000));
    expect(inv2.token).not.toBe(inv1.token);

    // Old invitation 1 is replaced
    const check1 = await verifyInvitation(fixture.pool, inv1.token, new Date(t0.getTime() + 60000));
    expect(check1.valid).toBe(false);
    expect(check1.reason).toBe('replaced');

    await expect(
      acceptOrganizerInvitation(
        fixture.pool,
        inv1.token,
        { name: 'ทดสอบลิงก์เก่า', password: 'Password!004OldToken' },
        new Date(t0.getTime() + 60000),
      ),
    ).rejects.toThrow('คำเชิญนี้ถูกยกเลิกเนื่องจากมีการออกคำเชิญใหม่');

    // New invitation 2 is valid and can be accepted
    const check2 = await verifyInvitation(fixture.pool, inv2.token, new Date(t0.getTime() + 60000));
    expect(check2.valid).toBe(true);

    const acceptedUser = await acceptOrganizerInvitation(
      fixture.pool,
      inv2.token,
      { name: 'ผู้จัดงานลิงก์ใหม่', password: 'Password!004NewToken' },
      new Date(t0.getTime() + 61000),
    );
    expect(acceptedUser.role).toBe('organizer');

    // Confirm created user has role 'organizer' in auth_user, cannot be owner
    const dbUser = await fixture.pool.query('SELECT id, role, email FROM auth_user WHERE id = $1', [acceptedUser.id]);
    expect(dbUser.rows[0].role).toBe('organizer');
  });
});
