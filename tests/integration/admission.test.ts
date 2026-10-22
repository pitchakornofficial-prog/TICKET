import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture, fixtureAccounts } from '../support/auth-fixture';
import { createEventDraft, approveSession, addScannerToEvent } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  recordAdmissionScan,
  getAdmissionStats,
  getRecentAdmissionLogs,
  getTicketAdmissionHistory,
} from '../../src/server/admission';
import {
  getCapturedEmails,
  clearCapturedEmails,
  setCustomEmailTransport,
} from '../../src/server/email';

describe('TASK-020: Online Admission Scanning Integration Tests (AC-08, AC-39, AC-49, AC-95, AC-100, AC-101, AC-65)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function purchaseTestTickets(eventId: string, sessionId: string, ticketTypeId: string) {
    clearCapturedEmails();
    const guestEmail = `buyer-admission-${Date.now()}@ticket.invalid`;
    const guestPhone = '0812345678';
    const guestName = 'ผู้ซื้อเข้างานทดสอบ';

    const buyer = { name: guestName, email: guestEmail, phone: guestPhone };
    const reqRes = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
    expect(reqRes.success).toBe(true);

    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';
    const vRes = await verifyGuestOtp(fixture.pool, {
      email: guestEmail,
      code,
      requestId: reqRes.requestId ?? '',
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
    expect(vRes.success).toBe(true);

    const buyerToken = vRes.verifiedToken ?? '';
    const now = new Date();

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId,
        sessionId,
        items: [{ ticketTypeId, quantity: 2 }],
      },
      now,
    );
    expect(reservation.status).toBe('reserved');

    const charge = await createPaymentQr(
      fixture.pool,
      {
        orderId: reservation.id,
        verifiedToken: buyerToken,
      },
      now,
    );
    expect(charge.status).toBe('pending');

    const paymentTime = new Date(now.getTime() + 60 * 1000);
    const payRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: paymentTime,
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      paymentTime,
    );
    expect(payRes.success).toBe(true);
    expect(payRes.status).toBe('paid');

    // Retrieve generated tickets
    const tRes = await fixture.pool.query<{
      id: string;
      ticketCode: string;
      qrPayload: string;
      admissionStatus: string;
    }>('SELECT id, "ticketCode", "qrPayload", "admissionStatus" FROM tickets WHERE "orderId" = $1 ORDER BY "ticketCode"', [
      reservation.id,
    ]);

    return {
      orderId: reservation.id,
      tickets: tRes.rows,
    };
  }

  it('verifies full online admission state transitions: outside -> in -> repeat in (denied) -> exit -> repeat exit (denied) -> reentry (AC-08, AC-39, AC-49, AC-95)', async () => {
    // 1. Create event and session
    const eventDraft = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: 'คอนเสิร์ต สแกนออนไลน์ รอบหลัก',
        description: 'ทดสอบการสแกนบัตร',
        location: 'อิมแพ็ค อารีน่า',
        posterUrl: undefined,
      },
      [
        {
          startTime: '2026-12-31T18:00:00.000Z',
          endTime: '2026-12-31T23:00:00.000Z',
          ticketTypes: [{ name: 'Regular Seat', price: 1500, quota: 50 }],
        },
      ],
    );

    const sessionId = eventDraft.sessions[0].id;
    const ticketTypeId = eventDraft.sessions[0].ticketTypes[0].id;

    // Approve session
    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // Assign scanner to event
    await addScannerToEvent(fixture.pool, fixture.ids.organizer, eventDraft.id, {
      scannerId: fixture.ids.scanner,
      name: fixtureAccounts.scanner.name,
      email: fixtureAccounts.scanner.email,
    });

    // Purchase tickets
    const purchase = await purchaseTestTickets(eventDraft.id, sessionId, ticketTypeId);
    const targetTicket = purchase.tickets[0];

    // --- STEP A: Initial entry scan ---
    const entry1 = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId,
      qrPayloadOrCode: targetTicket.qrPayload,
      action: 'entry',
      now: new Date('2026-12-31T19:00:00.000Z'),
    });

    expect(entry1.success).toBe(true);
    expect(entry1.status).toBe('success');
    expect(entry1.action).toBe('entry');
    expect(entry1.ticket?.admissionStatus).toBe('inside');
    expect(entry1.message).toContain('บันทึกเข้างานสำเร็จ');

    // Confirm in DB
    const dbCheck1 = await fixture.pool.query('SELECT "admissionStatus" FROM tickets WHERE id = $1', [targetTicket.id]);
    expect(dbCheck1.rows[0].admissionStatus).toBe('inside');

    // --- STEP B: Repeat entry scan without exit (AC-49, AC-08) ---
    const repeatEntry = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId,
      qrPayloadOrCode: targetTicket.qrPayload,
      action: 'entry',
      now: new Date('2026-12-31T19:05:00.000Z'),
    });

    expect(repeatEntry.success).toBe(false);
    expect(repeatEntry.status).toBe('rejected');
    expect(repeatEntry.reason).toBe('ALREADY_INSIDE');
    expect(repeatEntry.message).toContain('บัตรอยู่ในพื้นที่จัดงานแล้ว');

    // --- STEP C: Exit scan (AC-39) ---
    const exit1 = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId,
      qrPayloadOrCode: targetTicket.ticketCode, // supports ticketCode or qrPayload
      action: 'exit',
      now: new Date('2026-12-31T20:00:00.000Z'),
    });

    expect(exit1.success).toBe(true);
    expect(exit1.status).toBe('success');
    expect(exit1.action).toBe('exit');
    expect(exit1.ticket?.admissionStatus).toBe('outside');
    expect(exit1.message).toContain('บันทึกออกนอกงานสำเร็จ');

    // Confirm in DB
    const dbCheck2 = await fixture.pool.query('SELECT "admissionStatus" FROM tickets WHERE id = $1', [targetTicket.id]);
    expect(dbCheck2.rows[0].admissionStatus).toBe('outside');

    // --- STEP D: Repeat exit scan when already outside ---
    const repeatExit = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId,
      qrPayloadOrCode: targetTicket.ticketCode,
      action: 'exit',
      now: new Date('2026-12-31T20:02:00.000Z'),
    });

    expect(repeatExit.success).toBe(false);
    expect(repeatExit.status).toBe('rejected');
    expect(repeatExit.reason).toBe('NOT_INSIDE');

    // --- STEP E: Re-entry scan (AC-95) ---
    const reentry = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId,
      qrPayloadOrCode: targetTicket.qrPayload,
      action: 'entry',
      now: new Date('2026-12-31T20:30:00.000Z'),
    });

    expect(reentry.success).toBe(true);
    expect(reentry.status).toBe('success');
    expect(reentry.action).toBe('entry');
    expect(reentry.ticket?.admissionStatus).toBe('inside');

    // Check complete audit history for this ticket
    const history = await getTicketAdmissionHistory(fixture.pool, targetTicket.id);
    expect(history.length).toBe(5); // entry(success), entry(rejected: ALREADY_INSIDE), exit(success), exit(rejected: NOT_INSIDE), entry(success)

    // Check stats
    const stats = await getAdmissionStats(fixture.pool, sessionId);
    expect(stats.currentlyInside).toBe(1);
    expect(stats.totalEntries).toBe(2);
    expect(stats.totalExits).toBe(1);

    // Check recent logs (AC-65: no buyer PII)
    const logs = await getRecentAdmissionLogs(fixture.pool, sessionId);
    expect(logs.length).toBeGreaterThanOrEqual(5);
    for (const log of logs) {
      expect((log as unknown as Record<string, unknown>).buyerName).toBeUndefined();
      expect((log as unknown as Record<string, unknown>).buyerEmail).toBeUndefined();
      expect((log as unknown as Record<string, unknown>).buyerPhone).toBeUndefined();
    }
  });

  it('guarantees concurrency control: two simultaneous online entry scans allow only one success (AC-101)', async () => {
    const eventDraft = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: 'คอนเสิร์ต ทดสอบแย่งสแกน Concurrency',
        description: 'AC-101 Concurrency Control',
        location: 'อิมแพ็ค เมืองทองธานี',
        posterUrl: undefined,
      },
      [
        {
          startTime: '2026-12-31T18:00:00.000Z',
          endTime: '2026-12-31T23:00:00.000Z',
          ticketTypes: [{ name: 'Zone B', price: 2000, quota: 20 }],
        },
      ],
    );

    const sessionId = eventDraft.sessions[0].id;
    const ticketTypeId = eventDraft.sessions[0].ticketTypes[0].id;

    await approveSession(fixture.pool, sessionId, fixture.ids.owner);
    await addScannerToEvent(fixture.pool, fixture.ids.organizer, eventDraft.id, {
      scannerId: fixture.ids.scanner,
      name: fixtureAccounts.scanner.name,
      email: fixtureAccounts.scanner.email,
    });

    const purchase = await purchaseTestTickets(eventDraft.id, sessionId, ticketTypeId);
    const targetTicket = purchase.tickets[0];

    // Run two concurrent entry scans simultaneously on the same ticket
    const [result1, result2] = await Promise.all([
      recordAdmissionScan(fixture.pool, {
        scannerId: fixture.ids.scanner,
        scannerName: 'ประตูที่ 1',
        scannerRole: 'scanner',
        sessionId,
        qrPayloadOrCode: targetTicket.qrPayload,
        action: 'entry',
        now: new Date('2026-12-31T19:00:00.000Z'),
      }),
      recordAdmissionScan(fixture.pool, {
        scannerId: fixture.ids.scanner,
        scannerName: 'ประตูที่ 2',
        scannerRole: 'scanner',
        sessionId,
        qrPayloadOrCode: targetTicket.qrPayload,
        action: 'entry',
        now: new Date('2026-12-31T19:00:00.000Z'),
      }),
    ]);

    const successes = [result1, result2].filter(r => r.success);
    const rejections = [result1, result2].filter(r => !r.success);

    // Exactly one must succeed, exactly one must be rejected with ALREADY_INSIDE (AC-101)
    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);
    expect(rejections[0].reason).toBe('ALREADY_INSIDE');
  });

  it('rejects cross-event scanning, wrong session, and cancelled/refunded tickets (AC-08, AC-100, AC-101)', async () => {
    // Event 1 (Scanner has access)
    const event1 = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: 'คอนเสิร์ต 1 สำหรับสแกนเนอร์',
        description: 'งานที่ได้รับมอบหมาย',
        location: 'ฮอลล์ 1',
        posterUrl: undefined,
      },
      [
        {
          startTime: '2026-12-31T18:00:00.000Z',
          endTime: '2026-12-31T23:00:00.000Z',
          ticketTypes: [{ name: 'Type 1', price: 1000, quota: 10 }],
        },
      ],
    );
    await approveSession(fixture.pool, event1.sessions[0].id, fixture.ids.owner);
    await addScannerToEvent(fixture.pool, fixture.ids.organizer, event1.id, {
      scannerId: fixture.ids.scanner,
      name: fixtureAccounts.scanner.name,
      email: fixtureAccounts.scanner.email,
    });

    // Event 2 (Scanner does NOT have access)
    const event2 = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: 'คอนเสิร์ต 2 ที่สแกนเนอร์ไม่มีสิทธิ์',
        description: 'งานอื่น',
        location: 'ฮอลล์ 2',
        posterUrl: undefined,
      },
      [
        {
          startTime: '2026-12-31T18:00:00.000Z',
          endTime: '2026-12-31T23:00:00.000Z',
          ticketTypes: [{ name: 'Type 2', price: 1000, quota: 10 }],
        },
      ],
    );
    await approveSession(fixture.pool, event2.sessions[0].id, fixture.ids.owner);

    // Case 1: Scanner attempts to scan under Event 2 session (AC-08)
    const crossEventRes = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId: event2.sessions[0].id,
      qrPayloadOrCode: 'TK-WHATEVER',
      action: 'entry',
      now: new Date('2026-12-31T19:00:00.000Z'),
    });
    expect(crossEventRes.success).toBe(false);
    expect(crossEventRes.reason).toBe('UNAUTHORIZED_EVENT');

    // Purchase ticket under Event 1
    const purchase = await purchaseTestTickets(
      event1.id,
      event1.sessions[0].id,
      event1.sessions[0].ticketTypes[0].id,
    );
    const ticketA = purchase.tickets[0];
    const ticketB = purchase.tickets[1];

    // Case 2: Cancel ticketA and attempt scan (AC-101)
    await fixture.pool.query('UPDATE tickets SET status = \'cancelled\' WHERE id = $1', [ticketA.id]);
    const cancelScan = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId: event1.sessions[0].id,
      qrPayloadOrCode: ticketA.qrPayload,
      action: 'entry',
      now: new Date('2026-12-31T19:00:00.000Z'),
    });
    expect(cancelScan.success).toBe(false);
    expect(cancelScan.reason).toBe('TICKET_CANCELLED');

    // Case 3: Refund ticketB and attempt scan (AC-101)
    await fixture.pool.query('UPDATE tickets SET status = \'refunded\' WHERE id = $1', [ticketB.id]);
    const refundScan = await recordAdmissionScan(fixture.pool, {
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      sessionId: event1.sessions[0].id,
      qrPayloadOrCode: ticketB.qrPayload,
      action: 'entry',
      now: new Date('2026-12-31T19:00:00.000Z'),
    });
    expect(refundScan.success).toBe(false);
    expect(refundScan.reason).toBe('TICKET_REFUNDED');
  });
});
