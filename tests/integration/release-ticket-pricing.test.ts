import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft, approveSession } from '../../src/server/events';
import { saveEventFeeSettings } from '../../src/server/fees';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { clearCapturedEmails, getCapturedEmails } from '../../src/server/email';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import { getEventMoneyReport } from '../../src/server/reports';
import { submitRefundRequest, approveRefundRequest } from '../../src/server/refunds';
import { randomUUID } from 'node:crypto';

describe('Production pricing release checks', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  beforeAll(async () => { fixture = await authFixture('integration'); }, 30000);
  afterAll(async () => { if (fixture) await fixture.cleanup(); });

  it('charges the agreed regular and student totals and reports fees on actual ticket prices', async () => {
    const event = await createEventDraft(fixture.pool, fixture.ids.organizer, {
      title: 'Release pricing test', location: 'Test venue', limitPerOrder: 5,
    }, [{ startTime: '2027-01-01T12:00:00Z', endTime: '2027-01-01T14:00:00Z', ticketTypes: [
      { name: 'Admission', price: 150, studentPrice: 99, isStudentPrivilege: true, quota: 20 },
    ] }]);
    const session = event.sessions[0];
    await approveSession(fixture.pool, session.id, fixture.ids.owner);
    await saveEventFeeSettings(fixture.pool, event.id, {
      organizerFeeMode: 'percentage', organizerFeeRate: 2, organizerFeePrivilegeRate: 3,
      ubuPrivilegeMode: true, customerFeeMode: 'percentage', customerFeeRate: 6, reservePercentage: 0,
    }, fixture.ids.owner);

    let studentOrderId = '';
    let studentTicketId = '';
    for (const [email, expectedPrice, expectedFee, expectedTotal] of [
      ['release-regular@example.com', 150, 9, 159],
      ['release-student@ubu.ac.th', 99, 6, 105],
    ] as const) {
      const buyer = { name: 'Release Test', email, phone: '0812345678' };
      clearCapturedEmails();
      const request = await requestGuestOtp(fixture.pool, { buyer, purpose: 'checkout' });
      const code = getCapturedEmails().at(-1)?.text?.match(/\b\d{6}\b/)?.[0];
      expect(code).toBeTruthy();
      const verified = await verifyGuestOtp(fixture.pool, { email, code: code ?? '', requestId: request.requestId ?? '', purpose: 'checkout', buyer });
      const token = verified.verifiedToken ?? '';
      const order = await createReservation(fixture.pool, { verifiedToken: token, eventId: event.id, sessionId: session.id, items: [{ ticketTypeId: session.ticketTypes[0].id, quantity: 1 }] });
      expect(order.items[0].unitPrice).toBe(expectedPrice);
      expect(order.customerFee).toBe(expectedFee);
      expect(order.total).toBe(expectedTotal);
      const charge = await createPaymentQr(fixture.pool, { orderId: order.id, verifiedToken: token });
      expect(charge.amount).toBe(expectedTotal * 100);
      const paid = await verifyAndProcessPayment(fixture.pool, { chargeId: charge.id, providerPaidAt: new Date() });
      expect(paid.tickets).toHaveLength(1);
      expect(paid.tickets?.[0].ticketPrice).toBe(expectedPrice);
      if (expectedPrice === 99) {
        studentOrderId = order.id;
        studentTicketId = paid.tickets?.[0]?.id ?? '';
      }
    }
    const report = await getEventMoneyReport(fixture.pool, event.id, { id: fixture.ids.organizer, role: 'organizer' });
    expect(report.grossSales).toBe(249);
    expect(report.organizerFee).toBe(5.97);
    await expect(saveEventFeeSettings(fixture.pool, event.id, {
      organizerFeeMode: 'percentage', organizerFeeRate: 2, organizerFeePrivilegeRate: 9,
      ubuPrivilegeMode: true, customerFeeMode: 'percentage', customerFeeRate: 6, reservePercentage: 0,
    }, fixture.ids.owner)).rejects.toThrow();
    // Reports must use each order's stored fee rates even if event settings later differ.
    await fixture.pool.query('UPDATE event_fee_settings SET "organizerFeeRate" = 8, "organizerFeePrivilegeRate" = 9 WHERE "eventId" = $1', [event.id]);
    const historicalReport = await getEventMoneyReport(fixture.pool, event.id, { id: fixture.ids.organizer, role: 'organizer' });
    expect(historicalReport.organizerFee).toBe(5.97);
    const lookupToken = randomUUID();
    await fixture.pool.query(
      `INSERT INTO guest_verified_sessions (token, email, name, phone, purpose, "verifiedAt", "expiresAt") VALUES ($1, $2, $3, $4, 'order_lookup', now(), now() + interval '30 minutes')`,
      [lookupToken, 'release-student@ubu.ac.th', 'Release Test', '0812345678'],
    );
    const request = await submitRefundRequest(fixture.pool, { verifiedToken: lookupToken, orderId: studentOrderId, ticketIds: [studentTicketId], reason: 'Release refund test' });
    expect(request.success).toBe(true);
    const approved = await approveRefundRequest(fixture.pool, { refundRequestId: request.refundRequestId ?? '', reviewerUserId: fixture.ids.owner, reviewerName: 'Owner', reviewerRole: 'owner', now: new Date() });
    expect(approved.success).toBe(true);
    const afterRefund = await getEventMoneyReport(fixture.pool, event.id, { id: fixture.ids.organizer, role: 'organizer' });
    expect(afterRefund.approvedRefundDeductions).toBe(99);
    expect(afterRefund.organizerFee).toBe(3);
  }, 30000);

  it('preserves per-ticket prices when a general student discount applies to only two of three tickets', async () => {
    const event = await createEventDraft(fixture.pool, fixture.ids.organizer, { title: 'Partial discount test', location: 'Test', limitPerOrder: 5 }, [{ startTime: '2027-01-02T12:00:00Z', endTime: '2027-01-02T14:00:00Z', ticketTypes: [{ name: 'General', price: 10, quota: 10 }] }]);
    const session = event.sessions[0];
    await approveSession(fixture.pool, session.id, fixture.ids.owner);
    const buyer = { name: 'Partial Test', email: 'release-partial@ubu.ac.th', phone: '0812345678' };
    clearCapturedEmails();
    const request = await requestGuestOtp(fixture.pool, { buyer, purpose: 'checkout' });
    const code = getCapturedEmails().at(-1)?.text?.match(/\b\d{6}\b/)?.[0] ?? '';
    const verified = await verifyGuestOtp(fixture.pool, { email: buyer.email, code, requestId: request.requestId ?? '', purpose: 'checkout', buyer });
    const order = await createReservation(fixture.pool, { verifiedToken: verified.verifiedToken ?? '', eventId: event.id, sessionId: session.id, items: [{ ticketTypeId: session.ticketTypes[0].id, quantity: 3 }] });
    const prices = order.items.flatMap(item => Array(item.quantity).fill(item.unitPrice)).sort((a, b) => a - b);
    expect(prices).toEqual([8, 8, 10]);
    expect(prices.reduce((sum, price) => sum + price, 0)).toBe(order.subtotal - order.discountAmount);
  }, 30000);
});
