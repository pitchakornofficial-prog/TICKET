import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  requestOrderLookupOtp,
  verifyOrderLookupOtp,
  lookupGuestOrders,
  getGuestOrderDetail,
} from '../../src/server/guest-order-lookup';
import {
  getCapturedEmails,
  clearCapturedEmails,
  setCustomEmailTransport,
} from '../../src/server/email';

describe('TASK-018: Guest Order Lookup Integration Tests (AC-21, AC-22, AC-62, AC-63, AC-75)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(
    email: string,
    phone = '0812345678',
    name = 'ผู้ซื้อทดสอบ Lookup',
    now = new Date(),
  ) {
    clearCapturedEmails();
    const buyer = { name, email, phone };
    const reqRes = await requestGuestOtp(fixture.pool, { buyer, purpose: 'checkout', now });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';
    const verifyRes = await verifyGuestOtp(fixture.pool, {
      email,
      code,
      requestId: reqRes.requestId ?? '',
      purpose: 'checkout',
      buyer,
      now,
    });
    return verifyRes.verifiedToken ?? '';
  }

  it('AC-62: rejects OTP request when email or phone does not match an existing order', async () => {
    clearCapturedEmails();
    const t0 = new Date('2026-12-10T10:00:00.000Z');

    // 1. Non-existent email & phone
    const res1 = await requestOrderLookupOtp(fixture.pool, {
      email: 'nonexistent@example.com',
      phone: '0899999999',
      now: t0,
    });
    expect(res1.success).toBe(false);
    expect(res1.code).toBe('NOT_FOUND');
    expect(getCapturedEmails()).toHaveLength(0);
  });

  it('AC-62, AC-21: requests OTP, verifies OTP, and returns orders with issued tickets', async () => {
    clearCapturedEmails();
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-10T10:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Lookup Test AC-62', location: 'อิมแพ็ค ชาเลนเจอร์', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-10T19:00:00.000Z',
          endTime: '2026-12-10T22:00:00.000Z',
          ticketTypes: [{ name: 'บัตร Regular', price: 1500, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const buyerEmail = 'buyer_lookup_test@example.com';
    const buyerPhone = '081-234-5678';
    const buyerName = 'คุณสมหมาย ผู้รักดนตรี';
    const checkoutToken = await getVerifiedToken(buyerEmail, buyerPhone, buyerName, t0);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: checkoutToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      t0,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: checkoutToken },
      t0,
    );

    await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: new Date(t0.getTime() + 60000),
      },
      new Date(t0.getTime() + 60000),
    );

    // Now test Lookup:
    // Case 1: Mismatched phone with matching email is rejected (AC-62)
    const badPhoneRes = await requestOrderLookupOtp(fixture.pool, {
      email: buyerEmail,
      phone: '089-999-9999',
      now: t0,
    });
    expect(badPhoneRes.success).toBe(false);
    expect(badPhoneRes.code).toBe('NOT_FOUND');

    // Case 2: Matching email and phone succeeds
    clearCapturedEmails();
    const lookupReq = await requestOrderLookupOtp(fixture.pool, {
      email: buyerEmail,
      phone: buyerPhone,
      now: t0,
    });
    expect(lookupReq.success).toBe(true);
    expect(lookupReq.requestId).toBeDefined();

    // Verify OTP was sent via email
    const emails = getCapturedEmails();
    expect(emails.length).toBeGreaterThan(0);
    const otpEmail = emails.at(-1);
    expect(otpEmail?.to).toBe(buyerEmail);
    const otpMatch = otpEmail?.text?.match(/\b(\d{6})\b/);
    expect(otpMatch).toBeTruthy();
    const otpCode = otpMatch ? otpMatch[1] : '';

    // Verify with wrong OTP fails (AC-57, AC-59)
    const wrongVerify = await verifyOrderLookupOtp(fixture.pool, {
      email: buyerEmail,
      phone: buyerPhone,
      code: '000000',
      requestId: lookupReq.requestId ?? '',
      now: t0,
    });
    expect(wrongVerify.success).toBe(false);
    expect(wrongVerify.code).toBe('INVALID_CODE');

    // Verify with correct OTP succeeds
    const goodVerify = await verifyOrderLookupOtp(fixture.pool, {
      email: buyerEmail,
      phone: buyerPhone,
      code: otpCode,
      requestId: lookupReq.requestId ?? '',
      now: t0,
    });
    expect(goodVerify.success).toBe(true);
    expect(goodVerify.verifiedToken).toBeDefined();

    // Query orders with verified token
    const ordersResult = await lookupGuestOrders(fixture.pool, {
      verifiedToken: goodVerify.verifiedToken ?? '',
      now: t0,
    });

    expect(ordersResult.success).toBe(true);
    expect(ordersResult.orders).toBeDefined();
    expect(ordersResult.orders?.length).toBeGreaterThanOrEqual(1);

    const foundOrder = ordersResult.orders?.find(o => o.id === reservation.id);
    expect(foundOrder).toBeDefined();
    expect(foundOrder?.status).toBe('paid');
    expect(foundOrder?.tickets).toHaveLength(2);
    expect(foundOrder?.tickets[0].ticketCode).toBeDefined();
    expect(foundOrder?.tickets[0].qrCodeUrl).toContain('data:image/svg+xml');
    expect(foundOrder?.tickets[0].ticketCode).not.toBe(foundOrder?.tickets[1].ticketCode);
  });

  it('AC-22: Buyer A session is rejected from viewing Buyer B order (cross-buyer tampering protection)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-10T12:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Tamper Protection Event', location: 'Hall A', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-10T19:00:00.000Z',
          endTime: '2026-12-10T22:00:00.000Z',
          ticketTypes: [{ name: 'Standard', price: 1000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    // Buyer A
    const emailA = 'buyer_a@example.com';
    const phoneA = '0811111111';
    const tokenA = await getVerifiedToken(emailA, phoneA, 'Buyer A', t0);

    const resA = await createReservation(
      fixture.pool,
      {
        verifiedToken: tokenA,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      t0,
    );

    // Buyer B
    const emailB = 'buyer_b@example.com';
    const phoneB = '0822222222';
    const tokenB = await getVerifiedToken(emailB, phoneB, 'Buyer B', t0);

    const resB = await createReservation(
      fixture.pool,
      {
        verifiedToken: tokenB,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      t0,
    );

    // Generate verified lookup session for Buyer A
    clearCapturedEmails();
    const reqA = await requestOrderLookupOtp(fixture.pool, {
      email: emailA,
      phone: phoneA,
      now: t0,
    });
    const otpCodeA = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/)?.[1] ?? '';
    const verifyA = await verifyOrderLookupOtp(fixture.pool, {
      email: emailA,
      phone: phoneA,
      code: otpCodeA,
      requestId: reqA.requestId ?? '',
      now: t0,
    });
    const lookupTokenA = verifyA.verifiedToken ?? '';

    // Buyer A attempts to view Buyer B's order resB.id
    const tamperAttempt = await getGuestOrderDetail(fixture.pool, {
      verifiedToken: lookupTokenA,
      orderId: resB.id,
      now: t0,
    });

    expect(tamperAttempt.success).toBe(false);
    expect(tamperAttempt.code).toBe('FORBIDDEN');
    expect(tamperAttempt.order).toBeUndefined();

    // Buyer A accessing Buyer A's order resA.id succeeds
    const validAttempt = await getGuestOrderDetail(fixture.pool, {
      verifiedToken: lookupTokenA,
      orderId: resA.id,
      now: t0,
    });
    expect(validAttempt.success).toBe(true);
    expect(validAttempt.order?.id).toBe(resA.id);
  });

  it('AC-63: direct order link possession without verified session returns UNAUTHORIZED', async () => {
    const unverifiedAttempt = await getGuestOrderDetail(fixture.pool, {
      verifiedToken: 'unverified-fake-token',
      orderId: 'some-order-id',
    });

    expect(unverifiedAttempt.success).toBe(false);
    expect(unverifiedAttempt.code).toBe('UNAUTHORIZED');
  });

  it('AC-75: recovers order and original tickets after email delivery failure', async () => {
    setCustomEmailTransport(null);
    clearCapturedEmails();
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-10T14:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Delivery Recovery Test AC-75', location: 'Hall B', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-10T19:00:00.000Z',
          endTime: '2026-12-10T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP', price: 3000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const email = 'failed_email_buyer@example.com';
    const phone = '0833333333';
    const checkoutToken = await getVerifiedToken(email, phone, 'คุณผู้ซื้ออีเมลล้มเหลว', t0);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: checkoutToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      t0,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: checkoutToken },
      t0,
    );

    // Simulate email transport failure during payment processing
    setCustomEmailTransport({
      send: async () => {
        throw new Error('SMTP connection timed out');
      },
    });

    await verifyAndProcessPayment(
      fixture.pool,
      { chargeId: charge.id, providerPaidAt: new Date(t0.getTime() + 60000) },
      new Date(t0.getTime() + 60000),
    );

    // Restore working transport for OTP
    setCustomEmailTransport(null);
    clearCapturedEmails();

    // Buyer did not get ticket email, but visits lookup page with email + phone
    const req = await requestOrderLookupOtp(fixture.pool, { email, phone, now: t0 });
    expect(req.success).toBe(true);

    const otpCode = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/)?.[1] ?? '';
    const verify = await verifyOrderLookupOtp(fixture.pool, {
      email,
      phone,
      code: otpCode,
      requestId: req.requestId ?? '',
      now: t0,
    });
    expect(verify.success).toBe(true);

    const ordersResult = await lookupGuestOrders(fixture.pool, {
      verifiedToken: verify.verifiedToken ?? '',
      now: t0,
    });

    expect(ordersResult.success).toBe(true);
    const order = ordersResult.orders?.find(o => o.id === reservation.id);
    expect(order).toBeDefined();
    expect(order?.status).toBe('paid');
    // AC-75: Original tickets and QR codes are intact
    expect(order?.tickets).toHaveLength(1);
    expect(order?.tickets[0].ticketCode).toBeDefined();
    expect(order?.tickets[0].qrCodeUrl).toBeDefined();
    expect(order?.emailDelivery?.status).toBe('failed');
  });
});
