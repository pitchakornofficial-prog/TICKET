import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  correctOrderContact,
  getOrderContactAuditLogs,
  listPaidOrdersForOwner,
} from '../../src/server/contact-correction';
import {
  requestOrderLookupOtp,
  verifyOrderLookupOtp,
  getGuestOrderDetail,
  lookupGuestOrders,
} from '../../src/server/guest-order-lookup';
import {
  getCapturedEmails,
  clearCapturedEmails,
  setCustomEmailTransport,
} from '../../src/server/email';

describe('TASK-019: Owner Contact Correction Integration Tests (AC-76, G-24)', () => {
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
    name = 'ผู้ซื้อทดสอบ Correction',
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

  it('AC-76: rejects contact correction by organizer, scanner, or non-owner actor', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-15T10:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Correction Role Denial Event', location: 'Hall 1', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-15T19:00:00.000Z',
          endTime: '2026-12-15T22:00:00.000Z',
          ticketTypes: [{ name: 'Seat A', price: 1000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const email = 'original_buyer@example.com';
    const phone = '0811112222';
    const token = await getVerifiedToken(email, phone, 'นายเดิม ผู้ซื้อ', t0);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      t0,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: token },
      t0,
    );

    await verifyAndProcessPayment(
      fixture.pool,
      { chargeId: charge.id, providerPaidAt: new Date(t0.getTime() + 60000) },
      new Date(t0.getTime() + 60000),
    );

    // 1. Organizer attempts correction
    const orgAttempt = await correctOrderContact(fixture.pool, {
      orderId: reservation.id,
      newEmail: 'new_email@example.com',
      newPhone: '0899998888',
      reason: 'ผู้จัดงานต้องการแก้',
      actor: { id: orgId, role: 'organizer', name: 'นายผู้จัดงาน' },
      now: t0,
    });
    expect(orgAttempt.success).toBe(false);
    expect(orgAttempt.code).toBe('FORBIDDEN');

    // 2. Scanner attempts correction
    const scannerAttempt = await correctOrderContact(fixture.pool, {
      orderId: reservation.id,
      newEmail: 'new_email@example.com',
      newPhone: '0899998888',
      reason: 'ทีมสแกนต้องการแก้',
      actor: { id: 'scanner-id-1', role: 'scanner', name: 'ทีมสแกน' },
      now: t0,
    });
    expect(scannerAttempt.success).toBe(false);
    expect(scannerAttempt.code).toBe('FORBIDDEN');
  });

  it('AC-76, G-24: owner corrects contact of paid order, records audit log, and decouples old email session', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-15T12:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Owner Correction Success Event', location: 'Hall 2', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-15T19:00:00.000Z',
          endTime: '2026-12-15T22:00:00.000Z',
          ticketTypes: [{ name: 'Seat VIP', price: 2500, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const oldEmail = 'old_email_user@example.com';
    const oldPhone = '0812345678';
    const buyerName = 'คุณสมชาย ย้ายอีเมล';
    const oldToken = await getVerifiedToken(oldEmail, oldPhone, buyerName, t0);

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: oldToken,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 2 }],
      },
      t0,
    );

    const charge = await createPaymentQr(
      fixture.pool,
      { orderId: reservation.id, verifiedToken: oldToken },
      t0,
    );

    await verifyAndProcessPayment(
      fixture.pool,
      { chargeId: charge.id, providerPaidAt: new Date(t0.getTime() + 60000) },
      new Date(t0.getTime() + 60000),
    );

    // Verify order is listed in listPaidOrdersForOwner
    const listRes = await listPaidOrdersForOwner(fixture.pool, reservation.id);
    expect(listRes.length).toBeGreaterThanOrEqual(1);
    const orderInList = listRes.find(o => o.id === reservation.id);
    expect(orderInList).toBeDefined();
    expect(orderInList?.buyerEmail).toBe(oldEmail);
    expect(orderInList?.ticketCount).toBe(2);

    // Owner performs contact correction
    const newEmail = 'corrected_new_email@example.com';
    const newPhone = '0898765432';
    const reason = 'ตรวจสอบสำเนาบัตรประชาชนตรงกับชื่อผู้ซื้อและสลิปการโอนเงิน';

    const correctionRes = await correctOrderContact(fixture.pool, {
      orderId: reservation.id,
      newEmail,
      newPhone,
      reason,
      actor: { id: ownerId, role: 'owner', name: 'ผู้ดูแลระบบสูงสุด' },
      now: t0,
    });

    expect(correctionRes.success).toBe(true);
    expect(correctionRes.orderId).toBe(reservation.id);
    expect(correctionRes.previousEmail).toBe(oldEmail);
    expect(correctionRes.previousPhone).toBe(oldPhone);
    expect(correctionRes.newEmail).toBe(newEmail);
    expect(correctionRes.newPhone).toBe('0898765432');
    expect(correctionRes.auditLogId).toBeDefined();

    // Verify audit log
    const auditLogs = await getOrderContactAuditLogs(fixture.pool, reservation.id, {
      id: ownerId,
      role: 'owner',
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].previousEmail).toBe(oldEmail);
    expect(auditLogs[0].newEmail).toBe(newEmail);
    expect(auditLogs[0].previousPhone).toBe(oldPhone);
    expect(auditLogs[0].newPhone).toBe('0898765432');
    expect(auditLogs[0].reason).toBe(reason);
    expect(auditLogs[0].correctedByName).toBe('ผู้ดูแลระบบสูงสุด');

    // AC-76, G-24: Old verified session cannot access the order under new contact
    const oldSessionAttempt = await getGuestOrderDetail(fixture.pool, {
      verifiedToken: oldToken,
      orderId: reservation.id,
      now: t0,
    });
    expect(oldSessionAttempt.success).toBe(false);
    expect(oldSessionAttempt.code).toBe('FORBIDDEN');

    // Old email lookup returns no orders
    const oldLookupOrders = await lookupGuestOrders(fixture.pool, {
      verifiedToken: oldToken,
      now: t0,
    });
    const foundInOld = oldLookupOrders.orders?.find(o => o.id === reservation.id);
    expect(foundInOld).toBeUndefined();

    // Lookup using old email + phone is rejected before sending OTP
    const oldReq = await requestOrderLookupOtp(fixture.pool, {
      email: oldEmail,
      phone: oldPhone,
      now: t0,
    });
    expect(oldReq.success).toBe(false);
    expect(oldReq.code).toBe('NOT_FOUND');

    // Lookup using NEW email + phone succeeds and returns original tickets and QR codes
    clearCapturedEmails();
    const newReq = await requestOrderLookupOtp(fixture.pool, {
      email: newEmail,
      phone: newPhone,
      now: t0,
    });
    expect(newReq.success).toBe(true);

    const otpCode = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/)?.[1] ?? '';
    const verifyNew = await verifyOrderLookupOtp(fixture.pool, {
      email: newEmail,
      phone: newPhone,
      code: otpCode,
      requestId: newReq.requestId ?? '',
      now: t0,
    });
    expect(verifyNew.success).toBe(true);

    const newOrders = await lookupGuestOrders(fixture.pool, {
      verifiedToken: verifyNew.verifiedToken ?? '',
      now: t0,
    });
    expect(newOrders.success).toBe(true);
    const orderWithNewContact = newOrders.orders?.find(o => o.id === reservation.id);
    expect(orderWithNewContact).toBeDefined();
    expect(orderWithNewContact?.buyerEmail).toBe(newEmail);
    expect(orderWithNewContact?.buyerPhone).toBe('0898765432');
    expect(orderWithNewContact?.tickets).toHaveLength(2);
  });

  it('rejects contact correction for orders that are not in paid status', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const t0 = new Date('2026-12-15T14:00:00.000Z');

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'Unpaid Correction Test Event', location: 'Hall 3', limitPerOrder: 4 },
      [
        {
          startTime: '2026-12-15T19:00:00.000Z',
          endTime: '2026-12-15T22:00:00.000Z',
          ticketTypes: [{ name: 'Seat B', price: 500, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, ownerId);
    const ttId = event.sessions[0].ticketTypes[0].id;

    const email = 'unpaid_buyer@example.com';
    const phone = '0855556666';
    const token = await getVerifiedToken(email, phone, 'ผู้ซื้อยังไม่จ่าย', t0);

    // Reserved order (not paid)
    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: token,
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId: ttId, quantity: 1 }],
      },
      t0,
    );

    const unpaidedCorrection = await correctOrderContact(fixture.pool, {
      orderId: reservation.id,
      newEmail: 'new_unpaid@example.com',
      newPhone: '0877778888',
      reason: 'ต้องการแก้ก่อนจ่าย',
      actor: { id: ownerId, role: 'owner', name: 'Owner' },
      now: t0,
    });

    expect(unpaidedCorrection.success).toBe(false);
    expect(unpaidedCorrection.code).toBe('INVALID_STATUS');
  });
});
