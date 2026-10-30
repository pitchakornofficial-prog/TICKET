import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
  submitSessionCancellation,
  approveSessionCancellation,
} from '../../src/server/events';
import { saveEventFeeSettings } from '../../src/server/fees';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, getPaymentChargeForOrder } from '../../src/server/payment';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';
import {
  setStripeClient,
  resetStripeClient,
  StripeContractDouble,
  type StripeClient,
} from '../../src/server/stripe';

describe('Payment QR creation and quotation consistency (TASK-042, AC-118, AC-15, AC-26, AC-12, AC-13, AC-70, AC-120, AC-123)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  beforeEach(() => {
    resetStripeClient();
  });

  afterAll(async () => {
    resetStripeClient();
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(email: string, name = 'ผู้ซื้อทดสอบ', now = new Date()) {
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

  it('rejects direct payment request when OTP token is missing or invalid (AC-12)', async () => {
    await expect(
      createPaymentQr(fixture.pool, {
        orderId: 'ORD-FAKE-001',
        verifiedToken: 'invalid-or-fake-token',
      }),
    ).rejects.toThrow('กรุณายืนยันตัวตนผ่าน OTP');
  });

  it('creates Stripe PromptPay QR matching exact order quote and THB currency, and is idempotent on repeat (AC-15, AC-26, AC-13, AC-70, AC-118)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T10:00:00.000Z');

    // 1. Create event with per_ticket customer fee 25 THB
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Payment QR Stripe', location: 'รอยัล พารากอน ฮอลล์', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'บัตร Regular', price: 1500, quota: 50 }],
        },
      ],
    );

    await saveEventFeeSettings(
      fixture.pool,
      event.id,
      {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 25,
        reservePercentage: 10,
      },
      ownerId,
    );

    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    // 2. Guest reserves 2 tickets: subtotal = 3,000 THB, fee = 50 THB, total = 3,050 THB
    const buyerEmail = 'buyer-payment-qr-stripe@ticket.invalid';
    const token = await getVerifiedToken(buyerEmail, 'ผู้ซื้อทดสอบ QR', baseTime);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      baseTime,
    );

    expect(reservation.subtotal).toBe(3000);
    expect(reservation.customerFee).toBe(50);
    expect(reservation.total).toBe(3050);

    // 3. Create payment QR: must match exact satang 305,000 and THB (AC-15, AC-26, AC-118)
    const charge = await createPaymentQr(
      fixture.pool,
      {
        orderId: reservation.id,
        verifiedToken: token,
      },
      baseTime,
    );

    expect(charge.id).toMatch(/^pi_test_/);
    expect(charge.orderId).toBe(reservation.id);
    expect(charge.amount).toBe(305000); // 3,050.00 THB in satang
    expect(charge.currency).toBe('thb');
    expect(charge.status).toBe('pending');
    expect(charge.livemode).toBe(false);
    expect(charge.qrCodeUrl).toContain('data:image/svg+xml');
    expect(new Date(charge.expiresAt).getTime()).toBe(new Date(reservation.expiresAt).getTime());

    // Check getPaymentChargeForOrder with verified token
    const fetched = await getPaymentChargeForOrder(fixture.pool, reservation.id, token, baseTime);
    expect(fetched?.id).toBe(charge.id);
    expect(fetched?.amount).toBe(305000);
    expect(fetched?.livemode).toBe(false);

    // 4. Repeated creation call returns existing charge without creating a duplicate Stripe intent (AC-70, AC-120)
    const midTime = new Date(baseTime.getTime() + 5 * 60 * 1000); // 5 mins in
    const repeatCharge = await createPaymentQr(
      fixture.pool,
      {
        orderId: reservation.id,
        verifiedToken: token,
      },
      midTime,
    );

    expect(repeatCharge.id).toBe(charge.id);
    expect(repeatCharge.amount).toBe(charge.amount);
    expect(repeatCharge.expiresAt).toBe(charge.expiresAt); // Deadline is unchanged
  });

  it('rejects payment request for order owned by a different buyer (AC-12)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T12:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Cross User Stripe', location: 'ธันเดอร์โดม', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP', price: 2000, quota: 20 }],
        },
      ],
    );
    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    // Buyer 1 creates reservation
    const token1 = await getVerifiedToken('buyer-owner-stripe-1@ticket.invalid', 'เจ้าของ order', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token1,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      baseTime,
    );

    // Buyer 2 tries to generate payment QR for Buyer 1's order
    const token2 = await getVerifiedToken('buyer-intruder-stripe-2@ticket.invalid', 'ผู้ไม่ได้รับอนุญาต', baseTime);
    await expect(
      createPaymentQr(
        fixture.pool,
        {
          orderId: reservation.id,
          verifiedToken: token2,
        },
        baseTime,
      ),
    ).rejects.toThrow('ท่านไม่มีสิทธิ์ในการชำระเงินสำหรับคำสั่งซื้อนี้');

    // Also verify getPaymentChargeForOrder rejects cross-buyer lookup
    await expect(
      getPaymentChargeForOrder(fixture.pool, reservation.id, token2, baseTime),
    ).rejects.toThrow('ท่านไม่มีสิทธิ์ในการเข้าถึงข้อมูลการชำระเงินสำหรับคำสั่งซื้อนี้');
  });

  it('rejects payment QR request when reservation has expired and updates order status (AC-71)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T14:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Expired Stripe Payment', location: 'MCC Hall', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'Standing', price: 800, quota: 20 }],
        },
      ],
    );
    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const token = await getVerifiedToken('buyer-exp-payment-stripe@ticket.invalid', 'ผู้ซื้อ', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      baseTime,
    );

    // Call after 15 minutes have passed
    const afterExpiry = new Date(baseTime.getTime() + 16 * 60 * 1000);
    await expect(
      createPaymentQr(
        fixture.pool,
        {
          orderId: reservation.id,
          verifiedToken: token,
        },
        afterExpiry,
      ),
    ).rejects.toThrow('หมดเวลาการกันบัตรหรือถูกยกเลิกแล้ว');

    // Confirm order status was set to expired in DB
    const res = await fixture.pool.query(`SELECT status FROM orders WHERE id = $1`, [reservation.id]);
    expect(res.rows[0].status).toBe('expired');
  });

  it('rejects payment QR request when event session has been cancelled (AC-35)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T15:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Cancelled Session QR', location: 'Impact', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP', price: 2500, quota: 10 }],
        },
      ],
    );
    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const token = await getVerifiedToken('buyer-cancel-qr@ticket.invalid', 'ผู้ซื้อ', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      baseTime,
    );

    // Organizer requests cancellation, owner approves
    const cancelRes = await submitSessionCancellation(fixture.pool, {
      sessionId,
      reason: 'ศิลปินป่วยกะทันหัน',
      organizerId: orgId,
    });
    await approveSessionCancellation(fixture.pool, {
      cancellationId: cancelRes.cancellationId,
      ownerId,
    });

    await expect(
      createPaymentQr(
        fixture.pool,
        {
          orderId: reservation.id,
          verifiedToken: token,
        },
        baseTime,
      ),
    ).rejects.toThrow('รอบการแสดงถูกยกเลิกแล้ว');
  });

  it('handles concurrent payment QR requests safely without duplicate intent or liability (AC-120)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T16:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Concurrent QR', location: 'Impact', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'Regular', price: 1200, quota: 20 }],
        },
      ],
    );
    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const token = await getVerifiedToken('buyer-concurrent-qr@ticket.invalid', 'ผู้ซื้อ Concurrent', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      baseTime,
    );

    const double = new StripeContractDouble();
    setStripeClient(double);

    // Two simultaneous requests to create QR
    const [charge1, charge2] = await Promise.all([
      createPaymentQr(fixture.pool, { orderId: reservation.id, verifiedToken: token }, baseTime),
      createPaymentQr(fixture.pool, { orderId: reservation.id, verifiedToken: token }, baseTime),
    ]);

    expect(charge1.id).toBe(charge2.id);
    expect(charge1.amount).toBe(240000);
    expect(charge1.expiresAt).toBe(charge2.expiresAt);
    // Stripe double created only ONE PaymentIntent
    expect(double.getCreatedIntentsCount()).toBe(1);
  });

  it('recovers from ambiguous provider timeout without creating extra intent or changing deadline (AC-120)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T17:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Ambiguous Timeout', location: 'Impact', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'Regular', price: 1000, quota: 20 }],
        },
      ],
    );
    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const token = await getVerifiedToken('buyer-timeout-qr@ticket.invalid', 'ผู้ซื้อ Timeout', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      baseTime,
    );

    const double = new StripeContractDouble();
    setStripeClient(double);

    // Simulate provider ambiguous timeout: intent was created in Stripe, but caller experienced timeout
    double.simulateTimeoutAfterCreateNext();

    await expect(
      createPaymentQr(fixture.pool, { orderId: reservation.id, verifiedToken: token }, baseTime),
    ).rejects.toThrow('Stripe API request timed out');

    // Total created in Stripe so far: 1
    expect(double.getCreatedIntentsCount()).toBe(1);

    // Caller retries creation after timeout: must recover the previously created intent via idempotency key
    const retryTime = new Date(baseTime.getTime() + 10 * 1000); // 10s later
    const recoveredCharge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: token },
      retryTime,
    );

    expect(recoveredCharge.id).toMatch(/^pi_test_/);
    expect(recoveredCharge.amount).toBe(100000);
    // Original reservation deadline is preserved, NOT extended
    expect(new Date(recoveredCharge.expiresAt).getTime()).toBe(new Date(reservation.expiresAt).getTime());
    // Intent count remains 1, no duplicate intent created
    expect(double.getCreatedIntentsCount()).toBe(1);
  });

  it('rejects Stripe intent when order reference or mode does not match (AC-119, AC-123)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T18:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Guard Mismatch', location: 'Impact', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'Regular', price: 500, quota: 10 }],
        },
      ],
    );
    await approveSession(fixture.pool, event.sessions[0].id, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const token = await getVerifiedToken('buyer-mismatch-qr@ticket.invalid', 'ผู้ซื้อ Mismatch', baseTime);
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId: event.sessions[0].id,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      baseTime,
    );

    // 1. Reference mismatch
    const badRefClient: StripeClient = {
      isLiveMode: () => false,
      createPromptPayIntent: async () => ({
        id: 'pi_test_bad_ref',
        object: 'payment_intent',
        amount: 50000,
        amount_received: 0,
        currency: 'thb',
        status: 'requires_action',
        client_secret: 'pi_test_bad_ref_secret',
        livemode: false,
        payment_method_types: ['promptpay'],
        metadata: { order_id: 'ORD-DIFFERENT-REF' },
        created: Math.floor(Date.now() / 1000),
      }),
      retrievePaymentIntent: async () => { throw new Error('Not implemented'); },
      cancelPaymentIntent: async () => { throw new Error('Not implemented'); },
    };

    setStripeClient(badRefClient);
    await expect(
      createPaymentQr(fixture.pool, { orderId: reservation.id, verifiedToken: token }, baseTime),
    ).rejects.toThrow('Stripe intent reference mismatch');

    // 2. Mode mismatch (livemode: true when server is test)
    const badModeClient: StripeClient = {
      isLiveMode: () => false,
      createPromptPayIntent: async (params) => ({
        id: 'pi_test_bad_mode',
        object: 'payment_intent',
        amount: params.amountSatang,
        amount_received: 0,
        currency: 'thb',
        status: 'requires_action',
        client_secret: 'pi_test_bad_mode_secret',
        livemode: true, // Mismatched livemode
        payment_method_types: ['promptpay'],
        metadata: { order_id: params.orderId },
        created: Math.floor(Date.now() / 1000),
      }),
      retrievePaymentIntent: async () => { throw new Error('Not implemented'); },
      cancelPaymentIntent: async () => { throw new Error('Not implemented'); },
    };

    setStripeClient(badModeClient);
    await expect(
      createPaymentQr(fixture.pool, { orderId: reservation.id, verifiedToken: token }, baseTime),
    ).rejects.toThrow('Stripe intent mode mismatch');
  });
});
