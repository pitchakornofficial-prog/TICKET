import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { authFixture } from '../support/auth-fixture';
import { setDatabasePool } from '../../src/server/database';
import { createEventDraft, addScannerToEvent } from '../../src/server/events';
import { GET as scannerAccessGet } from '../../src/app/scanner/access/route';
import { POST as admissionScanPost } from '../../src/app/api/scanner/admissions/scan/route';
import { createReservation } from '../../src/server/reservation';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { verifyAndProcessPayment, createPaymentQr } from '../../src/server/payment';
import { signScannerEventScopeCookie } from '../../src/server/scanner-scope';

describe('Issue #9: Scanner Atomic Device Binding Concurrency Tests (D-104)', () => {
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

  it('guarantees that only ONE device binds successfully and receives session under concurrent access (D-104)', async () => {
    const orgId = fixture.ids.organizer;

    // 1. Create Event with 1 session
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Concert Scanner Device Concurrency Test', location: 'Impact Arena' },
      [
        {
          startTime: '2026-12-10T19:00:00.000Z',
          endTime: '2026-12-10T22:00:00.000Z',
          ticketTypes: [{ name: 'Regular', price: 1000, quota: 100 }],
        },
      ],
    );

    // 2. Add an unbound scanner to this event
    const scannerRes = await addScannerToEvent(fixture.pool, orgId, event.id, {
      name: 'สมหมาย สแกนเนอร์',
      email: 'scanner.device.race@ticket.invalid',
      password: 'Secure-Password-12345!',
    });
    const scannerId = scannerRes.scannerId;

    // 3. Two different devices open the scanner access URL simultaneously
    const deviceA = `device-A-${randomUUID()}`;
    const deviceB = `device-B-${randomUUID()}`;

    const reqA = new Request(
      `http://127.0.0.1:3000/scanner/access?scannerId=${scannerId}&eventId=${event.id}`,
      { headers: { cookie: `scanner_device_id=${deviceA}` } },
    );
    const reqB = new Request(
      `http://127.0.0.1:3000/scanner/access?scannerId=${scannerId}&eventId=${event.id}`,
      { headers: { cookie: `scanner_device_id=${deviceB}` } },
    );

    const [resA, resB] = await Promise.all([
      scannerAccessGet(reqA),
      scannerAccessGet(reqB),
    ]);

    const locationA = resA.headers.get('location') || '';
    const locationB = resB.headers.get('location') || '';

    // One must redirect to back-office, and the other must redirect to access-rejected
    const winnerIsA = locationA.includes('/back-office/scanner');
    const winnerIsB = locationB.includes('/back-office/scanner');

    expect(winnerIsA || winnerIsB).toBe(true);
    expect(winnerIsA && winnerIsB).toBe(false);

    if (winnerIsA) {
      expect(locationA).toContain(`/back-office/scanner?eventId=${event.id}`);
      expect(locationB).toContain('/scanner/access-rejected');
      expect(resA.headers.get('set-cookie')).toContain('ticket.session_token');
      expect(resB.headers.get('set-cookie') || '').not.toContain('ticket.session_token');
    } else {
      expect(locationB).toContain(`/back-office/scanner?eventId=${event.id}`);
      expect(locationA).toContain('/scanner/access-rejected');
      expect(resB.headers.get('set-cookie')).toContain('ticket.session_token');
      expect(resA.headers.get('set-cookie') || '').not.toContain('ticket.session_token');
    }

    // 4. Verify database state
    // boundDeviceId must be set to the winning device
    const boundDbRes = await fixture.pool.query<{ boundDeviceId: string | null }>(
      'SELECT "boundDeviceId" FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2',
      [event.id, scannerId],
    );
    expect(boundDbRes.rowCount).toBe(1);
    const actualBoundDevice = boundDbRes.rows[0].boundDeviceId;
    expect([deviceA, deviceB]).toContain(actualBoundDevice);

    // Exactly ONE session row in auth_session for this scanner
    const sessionsRes = await fixture.pool.query(
      'SELECT id, token FROM auth_session WHERE "userId" = $1',
      [scannerId],
    );
    expect(sessionsRes.rowCount).toBe(1);
  });

  it('rejects admission scan request when scanner_device_id does not match boundDeviceId in API', async () => {
    const orgId = fixture.ids.organizer;

    // Create event
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Concert Scan Device Check Test', location: 'Impact Arena' },
      [
        {
          startTime: '2026-12-15T19:00:00.000Z',
          endTime: '2026-12-15T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP', price: 2000, quota: 50 }],
        },
      ],
    );
    const sessionId = event.sessions[0].id;
    const ttId = event.sessions[0].ticketTypes[0].id;

    // Approve session and set admission window to include current time
    const now = new Date();
    await fixture.pool.query(
      `UPDATE event_sessions
       SET status = 'approved',
           "startTime" = $1,
           "endTime" = $2,
           "admissionStartTime" = $3,
           "admissionEndTime" = $4
       WHERE id = $5`,
      [
        new Date(now.getTime() - 3600000).toISOString(),
        new Date(now.getTime() + 7200000).toISOString(),
        new Date(now.getTime() - 3600000).toISOString(),
        new Date(now.getTime() + 7200000).toISOString(),
        sessionId,
      ],
    );

    // Add scanner
    const authorizedDeviceId = `auth-device-${randomUUID()}`;
    const scannerRes = await addScannerToEvent(fixture.pool, orgId, event.id, {
      name: 'สมหมาย มือถือประจำ',
      email: 'scanner.device.api@ticket.invalid',
      password: 'Secure-Scanner-Pass!01',
    });
    const scannerId = scannerRes.scannerId;

    // Bind authorizedDeviceId in event_scanners
    await fixture.pool.query(
      `UPDATE event_scanners SET "boundDeviceId" = $1, "boundAt" = now() WHERE "eventId" = $2 AND "scannerId" = $3`,
      [authorizedDeviceId, event.id, scannerId],
    );

    // Create a valid session token for scanner
    const token = `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
    await fixture.pool.query(
      `INSERT INTO auth_session (id, token, "userId", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, now() + interval '8 hours', now(), now())`,
      [randomUUID(), token, scannerId],
    );

    // Purchase a ticket to scan
    const buyerEmail = 'buyer.scan.test@ticket.invalid';
    const buyerPhone = '0812345678';
    const otpRes = await requestGuestOtp(fixture.pool, {
      buyer: { name: 'ผู้ซื้อบัตรสแกน', email: buyerEmail, phone: buyerPhone },
      purpose: 'checkout',
    });
    const { getCapturedEmails } = await import('../../src/server/email');
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const otpCode = match ? match[1] : '';
    const vRes = await verifyGuestOtp(fixture.pool, {
      email: buyerEmail,
      code: otpCode,
      requestId: otpRes.requestId ?? '',
      purpose: 'checkout',
      buyer: { name: 'ผู้ซื้อบัตรสแกน', email: buyerEmail, phone: buyerPhone },
    });
    const order = await createReservation(fixture.pool, {
      verifiedToken: vRes.verifiedToken ?? '',
      eventId: event.id,
      sessionId,
      items: [{ ticketTypeId: ttId, quantity: 1 }],
    });
    const qrRes = await createPaymentQr(fixture.pool, {
      orderId: order.id,
      verifiedToken: vRes.verifiedToken ?? '',
    });
    const paymentTime = new Date();
    const payRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: qrRes.id,
        providerPaidAt: paymentTime,
        actualAmount: qrRes.amount,
        actualCurrency: 'thb',
      },
      paymentTime,
    );
    expect(payRes.success).toBe(true);
    expect(payRes.status).toBe('paid');
    const ticketRes = await fixture.pool.query<{ qrPayload: string }>(
      'SELECT "qrPayload" FROM tickets WHERE "orderId" = $1',
      [order.id],
    );
    const qrPayload = ticketRes.rows[0].qrPayload;

    const secret = fixture.settings.secret;
    const scopeCookie = signScannerEventScopeCookie(event.id, secret);
    const tokenSig = createHmac('sha256', secret).update(token).digest('base64');
    const signedSessionToken = `${token}.${tokenSig}`;

    // 1. Scan from unauthorized device -> rejected with 403
    const unauthorizedCookie = `ticket.session_token=${signedSessionToken}; scanner_event_scope=${scopeCookie}; scanner_device_id=unauthorized-foreign-device`;
    const badReq = new Request('http://127.0.0.1:3000/api/scanner/admissions/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: unauthorizedCookie,
      },
      body: JSON.stringify({
        sessionId,
        qrPayloadOrCode: qrPayload,
        action: 'entry',
      }),
    });
    const badRes = await admissionScanPost(badReq);
    expect(badRes.status).toBe(403);
    const badBody = await badRes.json();
    expect(badBody.message).toContain('อุปกรณ์นี้ไม่ได้ผูกกับสิทธิ์เจ้าหน้าที่สแกนบัตร');

    // 2. Scan from authorized device -> 200 OK
    const authorizedCookie = `ticket.session_token=${signedSessionToken}; scanner_event_scope=${scopeCookie}; scanner_device_id=${authorizedDeviceId}`;
    const goodReq = new Request('http://127.0.0.1:3000/api/scanner/admissions/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: authorizedCookie,
      },
      body: JSON.stringify({
        sessionId,
        qrPayloadOrCode: qrPayload,
        action: 'entry',
      }),
    });
    const goodRes = await admissionScanPost(goodReq);
    expect(goodRes.status).toBe(200);
    const goodBody = await goodRes.json();
    expect(goodBody.result).toBeDefined();
    expect(goodBody.result.status).toBe('success');
  });
});
