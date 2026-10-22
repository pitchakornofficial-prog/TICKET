import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { authFixture } from '../support/auth-fixture';
import { testDatabaseUrl } from '../support/test-database';
import { createEventDraft, approveSession, addScannerToEvent, ensureEventSchema } from '../../src/server/events';
import { saveEventFeeSettings, ensureFeeSchema } from '../../src/server/fees';
import { requestGuestOtp, verifyGuestOtp, ensureGuestOtpSchema } from '../../src/server/guest-otp';
import { createReservation, getTicketTypeAvailableQuota, ensureReservationSchema } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment, ensurePaymentSchema } from '../../src/server/payment';
import { getOrderTickets, ensureTicketSchema } from '../../src/server/tickets';
import { submitRefundRequest, approveRefundRequest, ensureRefundSchema } from '../../src/server/refunds';
import { getEventMoneyReport } from '../../src/server/reports';
import { setEventPrimaryScanner, getEventPrimaryScanner, ensurePrimaryScannerSchema } from '../../src/server/primary-scanner';
import { syncOfflineAdmissionScans, ensureAdmissionSchema } from '../../src/server/admission';
import { getCapturedEmails, clearCapturedEmails } from '../../src/server/email';

describe('Shared Instance Contract across Multiple Web Processes (TASK-037, AC-105)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  let instanceA: Pool;
  let instanceB: Pool;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
    instanceA = fixture.pool;

    // Get the isolated test schema from instance A so instance B connects to the same schema
    const schemaRes = await instanceA.query('SHOW search_path');
    const searchPath = schemaRes.rows[0].search_path;
    const scopedUrl = new URL(testDatabaseUrl());
    scopedUrl.searchParams.set('options', `-c search_path=${searchPath}`);
    instanceB = new Pool({ connectionString: scopedUrl.toString(), max: 5 });

    // Pre-ensure schemas sequentially so concurrent DML requests do not race on PostgreSQL DDL catalogs
    await ensureGuestOtpSchema(instanceA);
    await ensureEventSchema(instanceA);
    await ensureFeeSchema(instanceA);
    await ensureReservationSchema(instanceA);
    await ensurePaymentSchema(instanceA);
    await ensureTicketSchema(instanceA);
    await ensureRefundSchema(instanceA);
    await ensureAdmissionSchema(instanceA);
    await ensurePrimaryScannerSchema(instanceA);
  }, 30000);

  afterAll(async () => {
    if (instanceB) await instanceB.end();
    if (fixture) await fixture.cleanup();
  });

  async function getVerifiedToken(pool: Pool, email: string, name = 'ผู้ซื้อหลายโพรเซส', now = new Date()) {
    clearCapturedEmails();
    const buyer = { name, email, phone: '0812345678' };
    const reqRes = await requestGuestOtp(pool, { buyer, purpose: 'checkout', now });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';
    const verifyRes = await verifyGuestOtp(pool, {
      email,
      code,
      requestId: reqRes.requestId ?? '',
      purpose: 'checkout',
      buyer,
      now,
    });
    return verifyRes.verifiedToken ?? '';
  }

  it('shared OTP rate limits: instance A attempts are immediately visible and enforced by instance B without in-memory state (AC-105, AC-59)', async () => {
    const email = `multi-instance-otp-${Date.now()}@ticket.invalid`;
    const buyer = { name: 'ผู้ซื้อหลายอินสแตนซ์', email, phone: '0899999999' };
    let currentTime = new Date('2026-11-01T14:00:00.000Z');

    // 1. Instance A requests OTP
    clearCapturedEmails();
    const reqRes = await requestGuestOtp(instanceA, { buyer, now: currentTime });
    expect(reqRes.success).toBe(true);
    const reqId = reqRes.requestId ?? '';

    // 2. Intentionally enter 4 wrong codes alternating across instance A and instance B
    for (let i = 1; i <= 4; i++) {
      currentTime = new Date(currentTime.getTime() + 2000);
      const wrongPool = i % 2 === 0 ? instanceA : instanceB;
      const res = await verifyGuestOtp(wrongPool, {
        email,
        code: `99999${i}`,
        requestId: reqId,
        buyer,
        now: currentTime,
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_CODE');
    }

    // 5th attempt on instance B triggers shared 15-minute lockout (AC-59)
    currentTime = new Date(currentTime.getTime() + 2000);
    const fifthAttempt = await verifyGuestOtp(instanceB, {
      email,
      code: '888888',
      requestId: reqId,
      buyer,
      now: currentTime,
    });
    expect(fifthAttempt.success).toBe(false);
    expect(fifthAttempt.code).toBe('BLOCKED');

    // 6th attempt on instance A is also locked out (shared state in PostgreSQL)
    currentTime = new Date(currentTime.getTime() + 2000);
    const sixthAttempt = await verifyGuestOtp(instanceA, {
      email,
      code: '123456',
      requestId: reqId,
      buyer,
      now: currentTime,
    });
    expect(sixthAttempt.success).toBe(false);
    expect(sixthAttempt.code).toBe('BLOCKED');
  });

  it('atomic inventory contention across instances: exactly 1 wins last remaining ticket without negative quota (AC-105, AC-14)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const now = new Date();

    // 1. Create event with exactly 1 ticket in quota
    const event = await createEventDraft(
      instanceA,
      orgId,
      { title: `คอนเสิร์ต แข่งขันข้ามอินสแตนซ์ ${Date.now()}`, location: 'อิมแพ็ค ฮอลล์ 1', limitPerOrder: 1 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'Last Ticket Zone', price: 1200, quota: 1 }],
        },
      ],
    );
    const sessionId = event.sessions[0].id;
    const ticketTypeId = event.sessions[0].ticketTypes[0].id;
    await approveSession(instanceA, sessionId, ownerId);

    // 2. Prepare two distinct buyers with verified tokens
    const emailA = `buyer-a-${Date.now()}@ticket.invalid`;
    const emailB = `buyer-b-${Date.now()}@ticket.invalid`;
    const tokenA = await getVerifiedToken(instanceA, emailA, 'ผู้ซื้อ เครื่อง A', now);
    const tokenB = await getVerifiedToken(instanceB, emailB, 'ผู้ซื้อ เครื่อง B', now);

    // 3. Concurrently submit reservation to Instance A and Instance B
    const [resA, resB] = await Promise.allSettled([
      createReservation(
        instanceA,
        {
          eventId: event.id,
          sessionId,
          items: [{ ticketTypeId, quantity: 1 }],
          verifiedToken: tokenA,
        },
        now,
      ),
      createReservation(
        instanceB,
        {
          eventId: event.id,
          sessionId,
          items: [{ ticketTypeId, quantity: 1 }],
          verifiedToken: tokenB,
        },
        now,
      ),
    ]);

    const fulfilled = [resA, resB].filter(r => r.status === 'fulfilled');
    const rejected = [resA, resB].filter(r => r.status === 'rejected');

    // Exactly one succeeds and one is rejected with insufficient quota
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.message).toMatch(/เหลือไม่เพียงพอ|โควตา/);

    // Available quota in PostgreSQL checked from instance B is strictly 0, never negative
    const availableOnB = await getTicketTypeAvailableQuota(instanceB, ticketTypeId);
    expect(availableOnB.availableQuota).toBe(0);
  });

  it('duplicate payment callbacks dispatched across different instances issue tickets once without double-crediting (AC-105, AC-18)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const now = new Date('2026-11-20T10:00:00.000Z');

    const event = await createEventDraft(
      instanceA,
      orgId,
      { title: `คอนเสิร์ต จ่ายเงินข้ามอินสแตนซ์ ${Date.now()}`, location: 'อิมแพ็ค ฮอลล์ 2', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'Standing', price: 1000, quota: 10 }],
        },
      ],
    );
    const sessionId = event.sessions[0].id;
    const ticketTypeId = event.sessions[0].ticketTypes[0].id;
    await approveSession(instanceA, sessionId, ownerId);

    const email = `buyer-pay-${Date.now()}@ticket.invalid`;
    const token = await getVerifiedToken(instanceA, email, 'ผู้ซื้อ ตรวจสอบจ่ายเงิน', now);
    const reservation = await createReservation(
      instanceA,
      {
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId, quantity: 2 }],
        verifiedToken: token,
      },
      now,
    );
    const orderId = reservation.id;

    // Create Payment QR on instance A
    const charge = await createPaymentQr(instanceA, { orderId, verifiedToken: token }, now);
    expect(charge.id).toBeDefined();

    // Simulate concurrent payment callbacks: one hits instance A, one hits instance B
    const payTime = new Date('2026-11-20T10:05:00.000Z');
    const [callbackA, callbackB] = await Promise.all([
      verifyAndProcessPayment(
        instanceA,
        {
          chargeId: charge.id,
          providerPaidAt: payTime,
          actualAmount: charge.amount,
          actualCurrency: 'thb',
        },
        payTime,
      ),
      verifyAndProcessPayment(
        instanceB,
        {
          chargeId: charge.id,
          providerPaidAt: payTime,
          actualAmount: charge.amount,
          actualCurrency: 'thb',
        },
        payTime,
      ),
    ]);

    // Both calls succeed, and idempotent protection prevents double-crediting
    expect(callbackA.success).toBe(true);
    expect(callbackB.success).toBe(true);

    // Verify tickets table has strictly 2 tickets (no duplicates)
    const tickets = await getOrderTickets(instanceB, orderId);
    expect(tickets).toHaveLength(2);
    expect(tickets[0].id).not.toBe(tickets[1].id);
  });

  it('cross-instance refund, payout and primary scanner handover remain atomic and consistent (AC-105, AC-36, AC-27, AC-97)', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;
    const now = new Date('2026-11-20T10:00:00.000Z');

    const event = await createEventDraft(
      instanceA,
      orgId,
      { title: `คอนเสิร์ต รีฟันด์ข้ามอินสแตนซ์ ${Date.now()}`, location: 'อารีน่า 3', limitPerOrder: 4 },
      [
        {
          startTime: '2026-11-28T19:00:00.000Z',
          endTime: '2026-11-28T22:00:00.000Z',
          ticketTypes: [{ name: 'Zone A', price: 2000, quota: 10 }],
        },
      ],
    );
    const sessionId = event.sessions[0].id;
    const ticketTypeId = event.sessions[0].ticketTypes[0].id;
    await approveSession(instanceA, sessionId, ownerId);
    await saveEventFeeSettings(
      instanceA,
      event.id,
      {
        customerFeeMode: 'per_order',
        customerFeeRate: 50,
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5,
        reservePercentage: 10,
      },
      ownerId,
    );

    const email = `buyer-ref-${Date.now()}@ticket.invalid`;
    const token = await getVerifiedToken(instanceA, email, 'ผู้ซื้อ ขอคืนเงิน', now);
    const reservation = await createReservation(
      instanceA,
      {
        eventId: event.id,
        sessionId,
        items: [{ ticketTypeId, quantity: 2 }],
        verifiedToken: token,
      },
      now,
    );
    const orderId = reservation.id;
    const charge = await createPaymentQr(instanceA, { orderId, verifiedToken: token }, now);
    await verifyAndProcessPayment(
      instanceA,
      {
        chargeId: charge.id,
        providerPaidAt: now,
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      now,
    );

    // 1. Submit partial refund for 1 ticket on instance A
    const tickets = await getOrderTickets(instanceA, orderId);
    expect(tickets).toHaveLength(2);

    const refRes = await submitRefundRequest(instanceA, {
      orderId,
      ticketIds: [tickets[0].id],
      reason: 'ไม่สะดวกเดินทาง',
      verifiedToken: token,
      bankName: 'ธนาคารกสิกรไทย',
      bankAccountNo: '123-4-56789-0',
      bankAccountName: 'ผู้ซื้อขอคืนเงิน',
      now,
    });
    expect(refRes.success).toBe(true);

    // 2. Approve refund on instance B
    const appRes = await approveRefundRequest(instanceB, {
      refundRequestId: refRes.refundRequestId ?? '',
      reviewerUserId: ownerId,
      reviewerName: 'เจ้าของเว็บทดสอบ',
      reviewerRole: 'owner',
      now,
    });
    expect(appRes.success).toBe(true);

    // 3. Money report on instance A immediately reflects deduction of liability
    const reportA = await getEventMoneyReport(instanceA, event.id, { id: ownerId, role: 'owner' });
    expect(reportA).toBeDefined();
    // V_o originally 4000, refund of 1 ticket is 2000 -> remaining net sales 2000
    expect(reportA?.grossSales).toBe(4000);
    expect(reportA?.approvedRefundDeductions).toBe(2000);
    expect(reportA?.netSales).toBe(2000);

    // 4. Primary scanner designated on instance A, inspected on instance B (AC-94, AC-97)
    const sc1 = await addScannerToEvent(instanceA, orgId, event.id, {
      name: 'เครื่องสแกน 1',
      email: `sc1-${Date.now()}@ticket.invalid`,
    });
    await setEventPrimaryScanner(
      instanceA,
      { id: orgId, role: 'organizer' },
      event.id,
      sc1.scannerId,
    );

    const primaryOnB = await getEventPrimaryScanner(instanceB, event.id);
    expect(primaryOnB?.scannerId).toBe(sc1.scannerId);

    // 5. Offline scan sync on instance A is idempotent and prevented on instance B (AC-102)
    const syncScanId = `sync-log-${Date.now()}`;
    const syncResA = await syncOfflineAdmissionScans(
      instanceA,
      { id: sc1.scannerId, role: 'scanner', name: 'เครื่องสแกน 1' },
      event.id,
      {
        scans: [
          {
            id: syncScanId,
            ticketId: tickets[1].id,
            ticketCode: tickets[1].ticketCode,
            sessionId,
            eventId: event.id,
            scannerId: sc1.scannerId,
            scannerName: 'เครื่องสแกน 1',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: now.toISOString(),
          },
        ],
      },
    );
    expect(syncResA.success).toBe(true);
    expect(syncResA.syncedCount).toBe(1);
    expect(syncResA.acknowledgedIds).toContain(syncScanId);

    // Duplicate sync sent to instance B
    const syncResB = await syncOfflineAdmissionScans(
      instanceB,
      { id: sc1.scannerId, role: 'scanner', name: 'เครื่องสแกน 1' },
      event.id,
      {
        scans: [
          {
            id: syncScanId, // same ID
            ticketId: tickets[1].id,
            ticketCode: tickets[1].ticketCode,
            sessionId,
            eventId: event.id,
            scannerId: sc1.scannerId,
            scannerName: 'เครื่องสแกน 1',
            action: 'entry',
            status: 'success',
            reason: null,
            deviceMode: 'offline',
            scannedAt: now.toISOString(),
          },
        ],
      },
    );
    // Duplicate skipped cleanly
    expect(syncResB.success).toBe(true);
    expect(syncResB.syncedCount).toBe(0);
    expect(syncResB.acknowledgedIds).toContain(syncScanId);
  });
});
