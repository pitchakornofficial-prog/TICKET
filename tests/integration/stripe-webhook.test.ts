import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { setDatabasePool } from '../../src/server/database';
import { createEventDraft, approveSession } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import {
  createPaymentQr,
  getPaymentChargeForOrder,
  processStripeSuccessEvent,
} from '../../src/server/payment';
import { getOrderTickets } from '../../src/server/tickets';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';
import {
  getStripeClient,
  generateStripeSignatureHeader,
  createStripeSuccessEvent,
  type StripeContractDouble,
  type StripePaymentIntent,
} from '../../src/server/stripe';
import { POST as handleStripeWebhook } from '../../src/app/api/webhooks/stripe/route';
import { POST as handlePayTest } from '../../src/app/api/public/checkout/orders/[id]/pay-test/route';

describe('Stripe Verified Webhook Ticket Issuance Integration (TASK-043, AC-119, AC-120, AC-123, AC-124, AC-125, AC-16, AC-17, AC-18)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';
  const webhookSecret = 'whsec_test_secret';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
    setDatabasePool(fixture.pool);
  }, 30000);

  afterAll(async () => {
    setDatabasePool(undefined);
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(email: string, name = 'ผู้ซื้อทดสอบ Stripe', now = new Date()) {
    clearCapturedEmails();
    const buyer = { name, email, phone: '0812345678' };
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

  it('delivers AC-119, AC-17, AC-124: timely verified Stripe webhook issues complete quota without partial issue', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-28T10:00:00.000Z');

    // 1. Create concert event
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตใหญ่ Stripe Live 2026', location: 'อิมแพ็ค อารีน่า', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-28T19:00:00.000Z',
          endTime: '2026-11-28T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP Zone A', price: 2000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const vipType = event.sessions[0].ticketTypes[0];

    // 2. Guest reserves 2 tickets
    const buyerEmail = 'buyer_stripe_timely@ticket.invalid';
    const buyerToken = await getVerifiedToken(buyerEmail, 'นายศิริพงษ์ พร้อมเพย์', baseTime);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: vipType.id, quantity: 2 }],
      },
      baseTime,
    );

    expect(reservation.status).toBe('reserved');
    const deadlineMs = new Date(reservation.expiresAt).getTime();

    // 3. Before payment verification: no tickets issued (AC-16)
    const ticketsBefore = await getOrderTickets(fixture.pool, reservation.id);
    expect(ticketsBefore).toHaveLength(0);

    // 4. Create Stripe PromptPay QR
    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: buyerToken },
      baseTime,
    );
    expect(charge.id).toMatch(/^pi_test_/);
    expect(charge.status).toBe('pending');

    // 5. Timely Stripe payment: Event created at baseTime + 5 minutes (T <= D)
    const paymentTime = new Date(baseTime.getTime() + 5 * 60 * 1000);
    const paymentTimeSec = Math.floor(paymentTime.getTime() / 1000);
    expect(paymentTimeSec * 1000).toBeLessThan(deadlineMs);

    const stripe = getStripeClient() as StripeContractDouble;
    const testEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: paymentTimeSec,
    });

    // 6. Process Stripe success event
    clearCapturedEmails();
    const result = await processStripeSuccessEvent(fixture.pool, { event: testEvent }, paymentTime);

    expect(result.success).toBe(true);
    expect(result.status).toBe('paid');
    expect(result.orderId).toBe(reservation.id);
    expect(result.tickets).toBeDefined();
    expect(result.tickets).toHaveLength(2);

    // Tickets are valid and have distinct codes and QR codes (AC-17, AC-19)
    const issuedTickets = result.tickets || [];
    expect(issuedTickets).toHaveLength(2);
    expect(issuedTickets[0].ticketCode).not.toBe(issuedTickets[1].ticketCode);
    expect(issuedTickets[0].qrPayload).not.toBe(issuedTickets[1].qrPayload);
    expect(issuedTickets[0].status).toBe('valid');
    expect(issuedTickets[1].status).toBe('valid');

    // Verify order status in DB is 'paid'
    const updatedCharge = await getPaymentChargeForOrder(fixture.pool, reservation.id);
    expect(updatedCharge?.status).toBe('successful');

    // Verify confirmation email was sent
    const emails = getCapturedEmails();
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.at(-1)?.to).toBe(buyerEmail);
  });

  it('delivers AC-18 & AC-120: duplicate webhooks and replay do not issue duplicate tickets or alter counts', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-28T11:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Idempotency Test', location: 'พารากอน', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-28T19:00:00.000Z',
          endTime: '2026-11-28T22:00:00.000Z',
          ticketTypes: [{ name: 'Standard', price: 1500, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const standardType = event.sessions[0].ticketTypes[0];

    const buyerEmail = 'buyer_idempotent@ticket.invalid';
    const buyerToken = await getVerifiedToken(buyerEmail, 'นายสมชาย ทดสอบซ้ำ', baseTime);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: standardType.id, quantity: 2 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: buyerToken },
      baseTime,
    );

    const stripe = getStripeClient() as StripeContractDouble;
    const paymentTimeSec = Math.floor(baseTime.getTime() / 1000) + 120;
    const eventId = 'evt_test_replay_unique_123';
    const testEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: paymentTimeSec,
      eventId,
    });

    // First delivery: issues tickets
    const firstResult = await processStripeSuccessEvent(fixture.pool, { event: testEvent });
    expect(firstResult.success).toBe(true);
    expect(firstResult.status).toBe('paid');
    expect(firstResult.tickets).toHaveLength(2);

    const firstTicketIds = (firstResult.tickets || []).map(t => t.id).sort();

    // Replay delivery of EXACT same event (AC-18, AC-120)
    const replayResult = await processStripeSuccessEvent(fixture.pool, { event: testEvent });
    expect(replayResult.success).toBe(true);
    expect(replayResult.status).toBe('paid');
    expect(replayResult.duplicate).toBe(true);
    expect(replayResult.tickets).toHaveLength(2);

    const replayTicketIds = (replayResult.tickets || []).map(t => t.id).sort();
    expect(replayTicketIds).toEqual(firstTicketIds);

    // Second distinct event for same intent (e.g. out-of-order retry)
    const secondEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: paymentTimeSec + 5,
      eventId: 'evt_test_second_delivery_456',
    });
    const secondResult = await processStripeSuccessEvent(fixture.pool, { event: secondEvent });
    expect(secondResult.success).toBe(true);
    expect(secondResult.status).toBe('paid');
    expect(secondResult.duplicate).toBe(true);

    // Total tickets in DB is strictly 2 (no duplicates, no count inflation)
    const dbTickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(dbTickets).toHaveLength(2);
  });

  it('delivers AC-119: rejects webhook when order, amount, currency, or mode mismatches without issuing tickets', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-28T12:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Mismatch Test', location: 'เมืองทอง', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-28T19:00:00.000Z',
          endTime: '2026-11-28T22:00:00.000Z',
          ticketTypes: [{ name: 'Tier 1', price: 1000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const tier1 = event.sessions[0].ticketTypes[0];

    const buyerEmail = 'buyer_mismatch@ticket.invalid';
    const buyerToken = await getVerifiedToken(buyerEmail, 'นายทดสอบ ผิดพลาด', baseTime);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: tier1.id, quantity: 1 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: buyerToken },
      baseTime,
    );

    const stripe = getStripeClient() as StripeContractDouble;

    // 1. Mismatched order_id in metadata
    stripe.setIntentOrderId(charge.id, 'ORD-WRONG-METADATA');
    const mismatchOrderEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: Math.floor(baseTime.getTime() / 1000) + 60,
    });
    const orderMismatchRes = await processStripeSuccessEvent(fixture.pool, { event: mismatchOrderEvent });
    expect(orderMismatchRes.success).toBe(false);
    expect(orderMismatchRes.status).toBe('mismatch');

    // Restore orderId
    stripe.setIntentOrderId(charge.id, reservation.id);

    // 2. Mismatched amount
    stripe.setIntentAmount(charge.id, charge.amount + 50000); // 500 THB extra
    const mismatchAmountEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: Math.floor(baseTime.getTime() / 1000) + 60,
    });
    const amountMismatchRes = await processStripeSuccessEvent(fixture.pool, { event: mismatchAmountEvent });
    expect(amountMismatchRes.success).toBe(false);
    expect(amountMismatchRes.status).toBe('mismatch');

    // Restore amount
    stripe.setIntentAmount(charge.id, charge.amount);

    // 3. Mismatched currency
    stripe.setIntentCurrency(charge.id, 'usd' as unknown as 'thb');
    const mismatchCurrencyEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: Math.floor(baseTime.getTime() / 1000) + 60,
    });
    const currencyMismatchRes = await processStripeSuccessEvent(fixture.pool, { event: mismatchCurrencyEvent });
    expect(currencyMismatchRes.success).toBe(false);
    expect(currencyMismatchRes.status).toBe('mismatch');

    // Restore currency
    stripe.setIntentCurrency(charge.id, 'thb');

    // 4. Missing Event.created (AC-125)
    const invalidEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: 0, // invalid timestamp
    });
    const invalidRes = await processStripeSuccessEvent(fixture.pool, { event: invalidEvent });
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.status).toBe('pending_review');

    // Tickets remain strictly unissued throughout all mismatches (AC-119, AC-125)
    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(0);
  });

  it('delivers AC-124: late Stripe payment (T > D) never issues tickets even if quota remains', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-28T13:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Late Payment Test', location: 'ไบเทค', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-28T19:00:00.000Z',
          endTime: '2026-11-28T22:00:00.000Z',
          ticketTypes: [{ name: 'Late Test', price: 1200, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const lateType = event.sessions[0].ticketTypes[0];

    const buyerEmail = 'buyer_late@ticket.invalid';
    const buyerToken = await getVerifiedToken(buyerEmail, 'นายจ่ายช้า เกินเวลา', baseTime);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: lateType.id, quantity: 1 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: buyerToken },
      baseTime,
    );

    const deadlineMs = new Date(reservation.expiresAt).getTime();
    // Stripe Event.created is 10 seconds AFTER deadline (T > D)
    const lateSec = Math.floor(deadlineMs / 1000) + 10;

    const stripe = getStripeClient() as StripeContractDouble;
    const lateEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: lateSec,
    });

    const result = await processStripeSuccessEvent(fixture.pool, { event: lateEvent });

    expect(result.success).toBe(false);
    expect(result.status).toBe('paid_after_deadline');
    expect(result.recoveryCase).toBeDefined();
    expect(result.recoveryCase?.reason).toBe('paid_after_deadline');

    // No tickets issued (AC-124, G-35)
    const tickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(tickets).toHaveLength(0);
  });

  it('delivers AC-123: rejects test-mode events and /pay-test route when live mode is configured', async () => {
    const stripe = getStripeClient() as StripeContractDouble;
    stripe.setLiveMode(true); // Simulate Live Mode

    try {
      const mockLiveIntent: StripePaymentIntent = {
        id: 'pi_test_livemode_guard',
        object: 'payment_intent',
        amount: 200000,
        amount_received: 200000,
        currency: 'thb',
        status: 'succeeded',
        client_secret: 'pi_test_livemode_guard_secret',
        livemode: false, // test-mode intent!
        payment_method_types: ['promptpay'],
        metadata: { order_id: 'ORD-LIVE-TEST' },
        created: Math.floor(Date.now() / 1000),
      };

      const testModeEvent = createStripeSuccessEvent({
        intent: mockLiveIntent,
        livemode: false,
      });

      // Live mode rejects test-mode event
      const res = await processStripeSuccessEvent(fixture.pool, { event: testModeEvent });
      expect(res.success).toBe(false);
      expect(res.status).toBe('mismatch');
      expect(res.message.toLowerCase()).toContain('live mode');

      // Live mode rejects direct /pay-test endpoint call (AC-123)
      const payTestRes = await handlePayTest(
        new Request('http://localhost/api/public/checkout/orders/ORD-LIVE-TEST/pay-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chargeId: 'pi_test_livemode_guard' }),
        }),
        { params: Promise.resolve({ id: 'ORD-LIVE-TEST' }) },
      );
      expect(payTestRes.status).toBe(403);
      const payTestData = await payTestRes.json();
      expect(payTestData.message).toContain('AC-123');
    } finally {
      stripe.setLiveMode(false);
    }
  });

  it('delivers AC-119: webhook HTTP endpoint verifies signature header, accepts valid signed payload and rejects forged signatures with 400', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-28T14:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ต Webhook HTTP Test', location: 'อิมแพ็ค', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-28T19:00:00.000Z',
          endTime: '2026-11-28T22:00:00.000Z',
          ticketTypes: [{ name: 'Standing', price: 800, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const standingType = event.sessions[0].ticketTypes[0];

    const buyerEmail = 'buyer_http_webhook@ticket.invalid';
    const buyerToken = await getVerifiedToken(buyerEmail, 'นายทดสอบ เว็บฮุก', baseTime);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: standingType.id, quantity: 1 }],
      },
      baseTime,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: buyerToken },
      baseTime,
    );

    const stripe = getStripeClient() as StripeContractDouble;
    const testEvent = stripe.createSuccessEvent({
      intentId: charge.id,
      created: Math.floor(baseTime.getTime() / 1000) + 60,
    });
    const rawBody = JSON.stringify(testEvent);

    // 1. Forged signature -> 400 Bad Request (AC-119)
    const forgedRes = await handleStripeWebhook(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=1730300000,v1=forged_invalid_signature_hex_123456',
        },
        body: rawBody,
      }),
    );
    expect(forgedRes.status).toBe(400);

    // 2. Missing signature -> 400 Bad Request (AC-119)
    const missingRes = await handleStripeWebhook(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody,
      }),
    );
    expect(missingRes.status).toBe(400);

    // 3. Valid signed webhook -> 200 OK and tickets issued (AC-119, AC-17)
    const validHeader = generateStripeSignatureHeader(rawBody, webhookSecret);
    const validRes = await handleStripeWebhook(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': validHeader,
        },
        body: rawBody,
      }),
    );
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.received).toBe(true);
    expect(validData.status).toBe('paid');
    expect(validData.ticketCount).toBe(1);

    // Tickets are indeed in DB
    const dbTickets = await getOrderTickets(fixture.pool, reservation.id);
    expect(dbTickets).toHaveLength(1);
  });
});
