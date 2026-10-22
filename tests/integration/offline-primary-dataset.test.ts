import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { authFixture, fixturePassword } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
  addScannerToEvent,
  listScannersForEvent,
} from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import { recordAdmissionScan } from '../../src/server/admission';
import {
  setEventPrimaryScanner,
  getEventPrimaryScanner,
  getOfflineDataset,
} from '../../src/server/primary-scanner';

import {
  setCustomEmailTransport,
  clearCapturedEmails,
  getCapturedEmails,
} from '../../src/server/email';

describe('TASK-032: Offline Primary Dataset Integration Tests (AC-94, AC-65, G-41)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';
  let secondOrganizerId: string;

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);

    // Create second organizer
    secondOrganizerId = randomUUID();
    const password = await hashPassword(fixturePassword);
    await fixture.pool.query(
      'INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, true, $4, now(), now())',
      [secondOrganizerId, 'ผู้จัดงานคนที่สอง', `second-org-${Date.now()}@ticket.invalid`, 'organizer'],
    );
    await fixture.pool.query(
      'INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $2, $4, now(), now())',
      [randomUUID(), secondOrganizerId, 'credential', password],
    );
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function purchaseTicket(eventId: string, sessionId: string, ticketTypeId: string) {
    const email = `buyer-offline-${randomUUID().slice(0, 8)}@ticket.invalid`;
    const phone = '0812345678';
    const buyer = {
      name: 'ผู้ซื้อบัตร ทดสอบ PII',
      email,
      phone,
    };

    clearCapturedEmails();
    const otpReq = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';

    const otpVerify = await verifyGuestOtp(fixture.pool, {
      requestId: otpReq.requestId ?? '',
      code,
      email,
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
    const verifiedToken = otpVerify.verifiedToken ?? '';

    const reservation = await createReservation(fixture.pool, {
      eventId,
      sessionId,
      verifiedToken,
      items: [{ ticketTypeId, quantity: 1 }],
    });

    const charge = await createPaymentQr(fixture.pool, {
      orderId: reservation.id,
      verifiedToken,
    });

    const payResult = await verifyAndProcessPayment(fixture.pool, {
      chargeId: charge.id,
      providerPaidAt: new Date(),
    });

    return {
      orderId: reservation.id,
      tickets: payResult.tickets || [],
      buyerSessionToken: verifiedToken,
    };
  }

  it('1. Primary assignment authorization: organizer A sets primary for Event A; organizer B cannot set Event A (AC-94)', async () => {
    const orgA = fixture.ids.organizer;
    const orgB = secondOrganizerId;

    // Organizer A creates Event A
    const eventA = await createEventDraft(
      fixture.pool,
      orgA,
      { title: `คอนเสิร์ต A ${Date.now()}`, location: 'อิมแพ็ค อารีน่า' },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP', price: 1000, quota: 50 }],
        },
      ],
    );

    // Organizer A adds Scanner 1 and Scanner 2
    const scanner1 = await addScannerToEvent(fixture.pool, orgA, eventA.id, {
      name: 'ทีมสแกน 1',
      email: `scanner1-${Date.now()}@ticket.invalid`,
    });
    const scanner2 = await addScannerToEvent(fixture.pool, orgA, eventA.id, {
      name: 'ทีมสแกน 2',
      email: `scanner2-${Date.now()}@ticket.invalid`,
    });

    // Organizer A assigns Scanner 1 as primary -> Success
    const primaryA = await setEventPrimaryScanner(
      fixture.pool,
      { id: orgA, role: 'organizer' },
      eventA.id,
      scanner1.scannerId,
      'device-001',
    );
    expect(primaryA.scannerId).toBe(scanner1.scannerId);
    expect(primaryA.scannerName).toBe('ทีมสแกน 1');

    // Organizer B tries to change Event A's primary scanner -> Rejected (403 / Forbidden)
    await expect(
      setEventPrimaryScanner(
        fixture.pool,
        { id: orgB, role: 'organizer' },
        eventA.id,
        scanner2.scannerId,
      ),
    ).rejects.toThrow('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการเครื่องหลักของคอนเสิร์ตนี้');

    // Scanner tries to set primary scanner -> Rejected
    await expect(
      setEventPrimaryScanner(
        fixture.pool,
        { id: scanner1.scannerId, role: 'scanner' },
        eventA.id,
        scanner2.scannerId,
      ),
    ).rejects.toThrow('ไม่อนุญาต: คุณไม่มีสิทธิ์จัดการเครื่องหลักของคอนเสิร์ตนี้');
  });

  it('2. Atomic uniqueness: exactly ONE primary scanner per event; setting new primary replaces old (AC-94, G-41)', async () => {
    const org = fixture.ids.organizer;

    const event = await createEventDraft(
      fixture.pool,
      org,
      { title: `คอนเสิร์ตเดี่ยว ${Date.now()}`, location: 'อิมแพ็ค ชาเลนเจอร์' },
      [
        {
          startTime: '2026-11-25T19:00:00.000Z',
          endTime: '2026-11-25T22:00:00.000Z',
          ticketTypes: [{ name: 'Zone A', price: 1500, quota: 20 }],
        },
      ],
    );

    const s1 = await addScannerToEvent(fixture.pool, org, event.id, {
      name: 'ทีม A',
      email: `sc-a-${Date.now()}@ticket.invalid`,
    });
    const s2 = await addScannerToEvent(fixture.pool, org, event.id, {
      name: 'ทีม B',
      email: `sc-b-${Date.now()}@ticket.invalid`,
    });

    // Set s1 as primary
    await setEventPrimaryScanner(
      fixture.pool,
      { id: org, role: 'organizer' },
      event.id,
      s1.scannerId,
    );

    let current = await getEventPrimaryScanner(fixture.pool, event.id);
    expect(current?.scannerId).toBe(s1.scannerId);

    let scannersList = await listScannersForEvent(fixture.pool, org, event.id);
    const itemS1 = scannersList.find(s => s.scannerId === s1.scannerId);
    const itemS2 = scannersList.find(s => s.scannerId === s2.scannerId);
    expect(itemS1?.isPrimary).toBe(true);
    expect(itemS2?.isPrimary).toBe(false);

    // Reassign s2 as primary -> s2 replaces s1 atomically
    await setEventPrimaryScanner(
      fixture.pool,
      { id: org, role: 'organizer' },
      event.id,
      s2.scannerId,
    );

    current = await getEventPrimaryScanner(fixture.pool, event.id);
    expect(current?.scannerId).toBe(s2.scannerId);

    scannersList = await listScannersForEvent(fixture.pool, org, event.id);
    const updatedS1 = scannersList.find(s => s.scannerId === s1.scannerId);
    const updatedS2 = scannersList.find(s => s.scannerId === s2.scannerId);
    expect(updatedS1?.isPrimary).toBe(false);
    expect(updatedS2?.isPrimary).toBe(true);
  });

  it('3. Offline dataset contains tickets/sessions/logs with zero buyer PII (AC-65, AC-94, G-41)', async () => {
    const org = fixture.ids.organizer;

    // Create event and approve session
    const event = await createEventDraft(
      fixture.pool,
      org,
      { title: `คอนเสิร์ตทดสอบ Dataset ${Date.now()}`, location: 'อิมแพ็ค' },
      [
        {
          startTime: '2026-11-28T18:00:00.000Z',
          endTime: '2026-11-28T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP Ticket', price: 2000, quota: 10 }],
        },
      ],
    );

    const sessionId = event.sessions[0].id;
    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // Add scanner & set as primary
    const sc = await addScannerToEvent(fixture.pool, org, event.id, {
      name: 'เครื่องหลักออฟไลน์',
      email: `scanner-primary-${Date.now()}@ticket.invalid`,
    });
    await setEventPrimaryScanner(
      fixture.pool,
      { id: org, role: 'organizer' },
      event.id,
      sc.scannerId,
    );

    // Purchase 2 tickets
    const ticketTypeId = event.sessions[0].ticketTypes[0].id;
    const purchase = await purchaseTicket(event.id, sessionId, ticketTypeId);
    expect(purchase.tickets.length).toBe(1);

    // Scan admission for ticket (entry)
    const scanRes = await recordAdmissionScan(fixture.pool, {
      sessionId,
      scannerId: sc.scannerId,
      scannerName: 'เครื่องหลักออฟไลน์',
      scannerRole: 'scanner',
      action: 'entry',
      qrPayloadOrCode: purchase.tickets[0].ticketCode,
      now: new Date('2026-11-28T19:00:00.000Z'),
    });
    expect(scanRes.success).toBe(true);

    // Fetch offline dataset as scanner
    const dataset = await getOfflineDataset(
      fixture.pool,
      { id: sc.scannerId, role: 'scanner' },
      event.id,
    );

    expect(dataset.event.id).toBe(event.id);
    expect(dataset.isCurrentScannerPrimary).toBe(true);
    expect(dataset.primaryScanner?.scannerId).toBe(sc.scannerId);
    expect(dataset.sessions.length).toBe(1);
    expect(dataset.totalTickets).toBeGreaterThanOrEqual(1);
    expect(dataset.lastSuccessfulSync).toBeDefined();

    // Verify tickets in dataset
    const foundTicket = dataset.tickets.find(t => t.id === purchase.tickets[0].id);
    expect(foundTicket).toBeDefined();
    expect(foundTicket?.admissionStatus).toBe('inside');
    expect(foundTicket?.status).toBe('valid');
    expect(foundTicket?.admissionWindow.startTime).toBe('2026-11-28T18:00:00.000Z');

    // CRITICAL (AC-65): Inspect that buyer PII is 100% absent!
    for (const ticket of dataset.tickets) {
      const raw = ticket as unknown as Record<string, unknown>;
      expect(raw.buyerName).toBeUndefined();
      expect(raw.buyerEmail).toBeUndefined();
      expect(raw.buyerPhone).toBeUndefined();
      expect(raw.customerFee).toBeUndefined();
      expect(raw.paymentId).toBeUndefined();
      expect(raw.chargeId).toBeUndefined();
      expect(raw.transferSlipUrl).toBeUndefined();
    }

    // Verify admission logs in dataset (zero PII)
    expect(dataset.admissionLogs.length).toBeGreaterThanOrEqual(1);
    for (const log of dataset.admissionLogs) {
      const rawLog = log as unknown as Record<string, unknown>;
      expect(rawLog.buyerName).toBeUndefined();
      expect(rawLog.buyerEmail).toBeUndefined();
      expect(rawLog.buyerPhone).toBeUndefined();
      expect(log.action).toBe('entry');
      expect(log.status).toBe('success');
    }
  });

  it('4. Cross-event scanner rejection: scanner assigned to Event B cannot download Event A dataset (AC-08)', async () => {
    const org = fixture.ids.organizer;

    const eventA = await createEventDraft(
      fixture.pool,
      org,
      { title: `Event A ${Date.now()}`, location: 'Hall A' },
      [
        {
          startTime: '2026-12-01T18:00:00.000Z',
          endTime: '2026-12-01T21:00:00.000Z',
          ticketTypes: [{ name: 'Normal', price: 500, quota: 10 }],
        },
      ],
    );

    const eventB = await createEventDraft(
      fixture.pool,
      org,
      { title: `Event B ${Date.now()}`, location: 'Hall B' },
      [
        {
          startTime: '2026-12-01T18:00:00.000Z',
          endTime: '2026-12-01T21:00:00.000Z',
          ticketTypes: [{ name: 'Normal', price: 500, quota: 10 }],
        },
      ],
    );

    // Scanner B is added ONLY to Event B
    const scannerB = await addScannerToEvent(fixture.pool, org, eventB.id, {
      name: 'ทีมเฉพาะงาน B',
      email: `scanner-b-${Date.now()}@ticket.invalid`,
    });

    // Scanner B attempts to download Event A offline dataset -> Rejected (403 / AC-08)
    await expect(
      getOfflineDataset(
        fixture.pool,
        { id: scannerB.scannerId, role: 'scanner' },
        eventA.id,
      ),
    ).rejects.toThrow('ไม่อนุญาต: คุณไม่ได้เป็นทีมสแกนของคอนเสิร์ตนี้ (AC-08)');
  });
});
