import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { saveEventFeeSettings } from '../../src/server/fees';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, getPaymentChargeForOrder } from '../../src/server/payment';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('Payment QR creation and quotation consistency (TASK-014, AC-15, AC-26, AC-12, AC-13, AC-70)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
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

  it('creates PromptPay QR matching exact order quote and THB currency, and is idempotent on repeat (AC-15, AC-26, AC-13, AC-70)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T10:00:00.000Z');

    // 1. Create event with per_ticket customer fee 25 THB
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Payment QR', location: 'รอยัล พารากอน ฮอลล์', limitPerOrder: 4 },
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
    const buyerEmail = 'buyer-payment-qr@ticket.invalid';
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

    // 3. Create payment QR: must match exact satang 305,000 and THB (AC-15, AC-26)
    const charge = await createPaymentQr(
      fixture.pool,
      {
        orderId: reservation.id,
        verifiedToken: token,
      },
      baseTime,
    );

    expect(charge.id).toMatch(/^chrg_test_/);
    expect(charge.orderId).toBe(reservation.id);
    expect(charge.amount).toBe(305000); // 3,050.00 THB in satang
    expect(charge.currency).toBe('thb');
    expect(charge.status).toBe('pending');
    expect(charge.qrCodeUrl).toContain('data:image/svg+xml');
    expect(new Date(charge.expiresAt).getTime()).toBe(new Date(reservation.expiresAt).getTime());

    // Check getPaymentChargeForOrder
    const fetched = await getPaymentChargeForOrder(fixture.pool, reservation.id);
    expect(fetched?.id).toBe(charge.id);
    expect(fetched?.amount).toBe(305000);

    // 4. Repeated creation call returns existing charge without creating a duplicate (AC-70)
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
      { title: 'คอนเสิร์ตทดสอบ Cross User', location: 'ธันเดอร์โดม', limitPerOrder: 4 },
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
    const token1 = await getVerifiedToken('buyer-owner-1@ticket.invalid', 'เจ้าของ order', baseTime);
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
    const token2 = await getVerifiedToken('buyer-intruder-2@ticket.invalid', 'ผู้ไม่ได้รับอนุญาต', baseTime);
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
  });

  it('rejects payment QR request when reservation has expired (AC-71)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const baseTime = new Date('2026-11-20T14:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตทดสอบ Expired Payment', location: 'MCC Hall', limitPerOrder: 4 },
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

    const token = await getVerifiedToken('buyer-exp-payment@ticket.invalid', 'ผู้ซื้อ', baseTime);
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
  });
});
