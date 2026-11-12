import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { authFixture } from '../support/auth-fixture';
import { setDatabasePool } from '../../src/server/database';
import {
  addScannerToEvent,
  createEventDraft,
  listScannersForEvent,
  resetScannerDeviceBinding,
} from '../../src/server/events';
import {
  hashScannerAccessToken,
  issueScannerAccessToken,
  issueScannerAccessTokenForOrganizer,
} from '../../src/server/scanner-access';
import { GET as scannerAccessGet } from '../../src/app/scanner/access/route';

describe('Scanner Single-Use, Expirable, Revocable Access Tokens (Integration)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
    process.env.BETTER_AUTH_URL = baseURL;
    process.env.BETTER_AUTH_SECRET = fixture.settings.secret;
    process.env.DATABASE_URL = fixture.pool.options.connectionString;
    setDatabasePool(fixture.pool);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  async function createTestEventAndScanner(suffix: string) {
    const event = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      { title: `Token Security Event ${suffix}`, location: 'Hall A' },
      [
        {
          startTime: '2026-12-20T18:00:00.000Z',
          endTime: '2026-12-20T22:00:00.000Z',
          ticketTypes: [{ name: 'GA', price: 900, quota: 50 }],
        },
      ],
    );
    const scanner = await addScannerToEvent(fixture.pool, fixture.ids.organizer, event.id, {
      name: `เจ้าหน้าที่ ${suffix}`,
      email: `scanner.token.${suffix}.${randomUUID().slice(0, 6)}@ticket.invalid`,
      password: 'Secure-Scanner-Token-Pass!01',
    });
    return { event, scanner };
  }

  it('blocks legacy /scanner/access?scannerId=...&eventId=... without a one-time token', async () => {
    const { event, scanner } = await createTestEventAndScanner('legacy-block');

    const req = new Request(
      `http://127.0.0.1:3000/scanner/access?scannerId=${scanner.scannerId}&eventId=${event.id}`,
      { headers: { cookie: `scanner_device_id=attacker-device-${randomUUID()}` } },
    );
    const res = await scannerAccessGet(req);

    expect(res.status).toBe(400);
    expect(res.headers.get('set-cookie') || '').not.toContain('ticket.session_token');

    const scanners = await listScannersForEvent(fixture.pool, fixture.ids.organizer, event.id);
    const target = scanners.find((s) => s.scannerId === scanner.scannerId);
    expect(target?.isBound).toBe(false);
    expect(target?.boundDeviceId).toBeNull();

    const sessionRes = await fixture.pool.query(
      'SELECT id FROM auth_session WHERE "userId" = $1',
      [scanner.scannerId],
    );
    expect(sessionRes.rowCount).toBe(0);
  });

  it('rejects unknown/forged tokens and stores only SHA-256 hashes in the database', async () => {
    const { event, scanner } = await createTestEventAndScanner('hash-forged');

    const issued = await issueScannerAccessToken(fixture.pool, {
      eventId: event.id,
      scannerId: scanner.scannerId,
      createdBy: fixture.ids.organizer,
    });

    expect(issued.accessUrl).toMatch(/^\/scanner\/access\?token=/);
    expect(issued.accessUrl).not.toContain(scanner.scannerId);

    // Raw token must NOT appear anywhere in scanner_access_tokens
    const dbTokens = await fixture.pool.query<{ tokenHash: string }>(
      'SELECT "tokenHash" FROM scanner_access_tokens WHERE "eventId" = $1 AND "scannerId" = $2',
      [event.id, scanner.scannerId],
    );
    expect(dbTokens.rowCount).toBe(1);
    expect(dbTokens.rows[0].tokenHash).toBe(hashScannerAccessToken(issued.rawToken));
    expect(dbTokens.rows[0].tokenHash).not.toBe(issued.rawToken);

    // Forged token fails with 403 and no session
    const forgedReq = new Request(
      `http://127.0.0.1:3000/scanner/access?token=forged-random-token-does-not-exist-123456`,
    );
    const forgedRes = await scannerAccessGet(forgedReq);
    expect(forgedRes.status).toBe(403);
    expect(forgedRes.headers.get('set-cookie') || '').not.toContain('ticket.session_token');
  });

  it('enforces single-use consumption: replaying a used token is rejected', async () => {
    const { event, scanner } = await createTestEventAndScanner('single-use');
    const issued = await issueScannerAccessToken(fixture.pool, {
      eventId: event.id,
      scannerId: scanner.scannerId,
      createdBy: fixture.ids.organizer,
    });

    const device1 = `legit-device-${randomUUID()}`;
    const firstReq = new Request(`http://127.0.0.1:3000${issued.accessUrl}`, {
      headers: { cookie: `scanner_device_id=${device1}` },
    });
    const firstRes = await scannerAccessGet(firstReq);
    expect(firstRes.status).toBe(307);
    expect(firstRes.headers.get('location')).toContain(`/back-office/scanner?eventId=${event.id}`);
    expect(firstRes.headers.get('set-cookie')).toContain('ticket.session_token');

    // Replay same token from another device -> rejected
    const replayReq2 = new Request(`http://127.0.0.1:3000${issued.accessUrl}`, {
      headers: { cookie: `scanner_device_id=other-device-${randomUUID()}` },
    });
    const replayRes2 = await scannerAccessGet(replayReq2);
    expect(replayRes2.status).toBe(307);
    expect(replayRes2.headers.get('location')).toContain('/scanner/access-rejected');
    expect(replayRes2.headers.get('set-cookie') || '').not.toContain('ticket.session_token');

    // Replay same token even from the SAME device -> still rejected (strictly single-use)
    const replayReq1 = new Request(`http://127.0.0.1:3000${issued.accessUrl}`, {
      headers: { cookie: `scanner_device_id=${device1}` },
    });
    const replayRes1 = await scannerAccessGet(replayReq1);
    expect(replayRes1.status).toBe(307);
    expect(replayRes1.headers.get('location')).toContain('/scanner/access-rejected');
    expect(replayRes1.headers.get('set-cookie') || '').not.toContain('ticket.session_token');
  });

  it('rejects expired tokens without binding device or issuing session', async () => {
    const { event, scanner } = await createTestEventAndScanner('expired');
    const pastTime = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const issued = await issueScannerAccessToken(fixture.pool, {
      eventId: event.id,
      scannerId: scanner.scannerId,
      createdBy: fixture.ids.organizer,
      expiresInHours: 1,
      now: pastTime,
    });

    const req = new Request(`http://127.0.0.1:3000${issued.accessUrl}`, {
      headers: { cookie: `scanner_device_id=device-${randomUUID()}` },
    });
    const res = await scannerAccessGet(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/scanner/access-rejected');
    expect(res.headers.get('location')).toContain('reason=expired');
    expect(res.headers.get('set-cookie') || '').not.toContain('ticket.session_token');

    const scanners = await listScannersForEvent(fixture.pool, fixture.ids.organizer, event.id);
    const target = scanners.find((s) => s.scannerId === scanner.scannerId);
    expect(target?.isBound).toBe(false);
  });

  it('revokes old leaked links upon rotation and upon device reset, preventing post-reset hijack', async () => {
    const { event, scanner } = await createTestEventAndScanner('rotate-reset');

    // 1. Initial token is issued and leaked before use
    const leakedToken1 = await issueScannerAccessToken(fixture.pool, {
      eventId: event.id,
      scannerId: scanner.scannerId,
      createdBy: fixture.ids.organizer,
    });

    // 2. Organizer rotates / re-issues token -> leakedToken1 must be revoked
    const rotatedToken2 = await issueScannerAccessTokenForOrganizer(
      fixture.pool,
      fixture.ids.organizer,
      event.id,
      scanner.scannerId,
    );

    const leakedAttempt = await scannerAccessGet(
      new Request(`http://127.0.0.1:3000${leakedToken1.accessUrl}`, {
        headers: { cookie: `scanner_device_id=attacker-1` },
      }),
    );
    expect(leakedAttempt.status).toBe(307);
    expect(leakedAttempt.headers.get('location')).toContain('reason=revoked');
    expect(leakedAttempt.headers.get('set-cookie') || '').not.toContain('ticket.session_token');

    // 3. Legitimate staff activates with rotatedToken2 on device1
    const device1 = `staff-device-1-${randomUUID()}`;
    const activate1 = await scannerAccessGet(
      new Request(`http://127.0.0.1:3000${rotatedToken2.accessUrl}`, {
        headers: { cookie: `scanner_device_id=${device1}` },
      }),
    );
    expect(activate1.status).toBe(307);
    expect(activate1.headers.get('location')).toContain(`/back-office/scanner?eventId=${event.id}`);

    // 4. Organizer resets device -> revokes prior tokens, clears binding, issues new token3
    const resetRes = await resetScannerDeviceBinding(
      fixture.pool,
      fixture.ids.organizer,
      event.id,
      scanner.scannerId,
    );
    expect(resetRes.success).toBe(true);
    expect(resetRes.accessUrl).toMatch(/^\/scanner\/access\?token=/);
    expect(resetRes.accessUrl).not.toBe(rotatedToken2.accessUrl);

    // 5. Attacker trying old links after reset fails!
    const postResetOldAttempt = await scannerAccessGet(
      new Request(`http://127.0.0.1:3000${rotatedToken2.accessUrl}`, {
        headers: { cookie: `scanner_device_id=attacker-2` },
      }),
    );
    expect(postResetOldAttempt.status).toBe(307);
    expect(postResetOldAttempt.headers.get('location')).toContain('/scanner/access-rejected');
    expect(postResetOldAttempt.headers.get('set-cookie') || '').not.toContain('ticket.session_token');

    // 6. Legitimate staff activates replacement device2 using the new reset token
    const device2 = `staff-device-2-${randomUUID()}`;
    const activate2 = await scannerAccessGet(
      new Request(`http://127.0.0.1:3000${resetRes.accessUrl}`, {
        headers: { cookie: `scanner_device_id=${device2}` },
      }),
    );
    expect(activate2.status).toBe(307);
    expect(activate2.headers.get('location')).toContain(`/back-office/scanner?eventId=${event.id}`);
    expect(activate2.headers.get('set-cookie')).toContain('ticket.session_token');

    const scanners = await listScannersForEvent(fixture.pool, fixture.ids.organizer, event.id);
    const updated = scanners.find((s) => s.scannerId === scanner.scannerId);
    expect(updated?.boundDeviceId).toBe(device2);
  });

  it('preserves organizer session and does NOT consume the single-use token when organizer opens the link (D-105)', async () => {
    const { event, scanner } = await createTestEventAndScanner('d105-org');
    const issued = await issueScannerAccessToken(fixture.pool, {
      eventId: event.id,
      scannerId: scanner.scannerId,
      createdBy: fixture.ids.organizer,
    });

    // Insert an organizer auth_session
    const orgToken = `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
    await fixture.pool.query(
      `INSERT INTO auth_session (id, token, "userId", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, now() + interval '2 hours', now(), now())`,
      [randomUUID(), orgToken, fixture.ids.organizer],
    );
    const sig = createHmac('sha256', fixture.settings.secret).update(orgToken).digest('base64');
    const orgCookie = `ticket.session_token=${orgToken}.${sig}`;

    const orgRes = await scannerAccessGet(
      new Request(`http://127.0.0.1:3000${issued.accessUrl}`, {
        headers: { cookie: orgCookie },
      }),
    );
    expect(orgRes.status).toBe(307);
    expect(orgRes.headers.get('location')).toContain(`/back-office/scanner?eventId=${event.id}`);
    expect(orgRes.headers.get('set-cookie') || '').not.toContain('ticket.session_token');

    // Token must still be unconsumed so the real scanner staff can use it afterwards
    const staffDevice = `staff-after-org-${randomUUID()}`;
    const staffRes = await scannerAccessGet(
      new Request(`http://127.0.0.1:3000${issued.accessUrl}`, {
        headers: { cookie: `scanner_device_id=${staffDevice}` },
      }),
    );
    expect(staffRes.status).toBe(307);
    expect(staffRes.headers.get('location')).toContain(`/back-office/scanner?eventId=${event.id}`);
    expect(staffRes.headers.get('set-cookie')).toContain('ticket.session_token');
  });
});
