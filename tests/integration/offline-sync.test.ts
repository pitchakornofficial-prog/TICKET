import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { authFixture, fixtureAccounts } from '../support/auth-fixture';
import {
  createEventDraft,
  approveSession,
  addScannerToEvent,
} from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import {
  setEventPrimaryScanner,
  getOfflineDataset,
} from '../../src/server/primary-scanner';
import {
  syncOfflineAdmissionScans,
  listAdmissionSyncConflicts,
  resolveAdmissionSyncConflict,
} from '../../src/server/admission';
import {
  submitRefundRequest,
  approveRefundRequest,
} from '../../src/server/refunds';
import {
  performOfflineAdmissionScan,
  getOfflinePendingScans,
  getOfflineDatasetKey,
} from '../../src/lib/offline-admission';
import {
  setCustomEmailTransport,
  clearCapturedEmails,
  getCapturedEmails,
} from '../../src/server/email';

function createMockStorage(initialData: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initialData));
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
  };
}

describe('TASK-034: Offline Sync Integration Tests (AC-99, AC-102)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  let eventId: string;
  let sessionId: string;
  let ticketTypeId: string;
  let primaryScannerId: string;
  let secondaryScannerId: string;
  let sessionStartTimeMs: number;

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);

    const org = fixture.ids.organizer;
    const now = Date.now();
    // 200 hours in future to allow refund cutoff eligibility
    sessionStartTimeMs = now + 200 * 3600 * 1000;
    const sessionStartTime = new Date(sessionStartTimeMs).toISOString();
    const sessionEndTime = new Date(sessionStartTimeMs + 4 * 3600 * 1000).toISOString();

    // 1. Create Event & Session
    const draft = await createEventDraft(
      fixture.pool,
      org,
      {
        title: 'ซิงก์ข้อมูลออฟไลน์ อินทิเกรชัน คอนเสิร์ต',
        location: 'อิมแพ็ค ชาเลนเจอร์',
      },
      [
        {
          startTime: sessionStartTime,
          endTime: sessionEndTime,
          ticketTypes: [{ name: 'Regular Zone', price: 1200, quota: 100 }],
        },
      ],
    );

    eventId = draft.id;
    sessionId = draft.sessions[0].id;
    ticketTypeId = draft.sessions[0].ticketTypes[0].id;

    await approveSession(fixture.pool, sessionId, fixture.ids.owner);

    // 2. Add primary scanner and secondary scanner
    const sc1 = await addScannerToEvent(fixture.pool, org, eventId, {
      name: 'หัวหน้าสแกน 1',
      email: `sync-pri-${Date.now()}@ticket.invalid`,
    });
    primaryScannerId = sc1.scannerId;

    const sc2 = await addScannerToEvent(fixture.pool, org, eventId, {
      name: 'สแกนรอง 2',
      email: `sync-sec-${Date.now()}@ticket.invalid`,
    });
    secondaryScannerId = sc2.scannerId;

    await setEventPrimaryScanner(
      fixture.pool,
      { id: org, role: 'organizer' },
      eventId,
      primaryScannerId,
    );
  }, 40000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function purchaseTicket(name: string, email: string) {
    clearCapturedEmails();
    const otpReq = await requestGuestOtp(fixture.pool, {
      buyer: { name, email, phone: '0812345678' },
      purpose: 'checkout',
      now: new Date(),
    });
    const match = getCapturedEmails().at(-1)?.text?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : '';

    const otpVerify = await verifyGuestOtp(fixture.pool, {
      requestId: otpReq.requestId ?? '',
      code,
      email,
      buyer: { name, email, phone: '0812345678' },
      purpose: 'checkout',
      now: new Date(),
    });

    const resv = await createReservation(fixture.pool, {
      eventId,
      sessionId,
      verifiedToken: otpVerify.verifiedToken ?? '',
      items: [{ ticketTypeId, quantity: 1 }],
    });

    const charge = await createPaymentQr(fixture.pool, {
      orderId: resv.id,
      verifiedToken: otpVerify.verifiedToken ?? '',
    });

    const payment = await verifyAndProcessPayment(fixture.pool, {
      chargeId: charge.id,
      providerPaidAt: new Date(),
    });

    const ticket = payment.tickets?.[0];
    if (!ticket) throw new Error('Ticket was not issued');

    return {
      orderId: resv.id,
      ticket,
      buyerToken: otpVerify.verifiedToken ?? '',
    };
  }

  it('1. Syncs offline entry scan back to server idempotently without duplicates (AC-102)', async () => {
    const buyerEmail = `sync-buyer-1-${randomUUID().slice(0, 8)}@ticket.invalid`;
    const purchase = await purchaseTicket('คุณทดสอบ ซิงก์ 1', buyerEmail);
    const ticket = purchase.ticket;

    // Get offline snapshot
    const dataset = await getOfflineDataset(fixture.pool, { id: primaryScannerId, role: 'scanner' }, eventId);
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(dataset),
    });

    // Offline scan at event session time (within admission window)
    const scanTime = new Date(sessionStartTimeMs + 1 * 3600 * 1000);
    const scanResult = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: ticket.ticketCode,
        action: 'entry',
        now: scanTime,
      },
      storage,
    );
    expect(scanResult.success).toBe(true);

    const pending = getOfflinePendingScans(eventId, storage);
    expect(pending).toHaveLength(1);

    // Initial Sync
    const syncRes1 = await syncOfflineAdmissionScans(
      fixture.pool,
      { id: primaryScannerId, role: 'scanner', name: 'หัวหน้าสแกน 1' },
      eventId,
      { scans: pending },
    );

    expect(syncRes1.syncedCount).toBe(1);
    expect(syncRes1.conflictsCount).toBe(0);
    expect(syncRes1.acknowledgedIds).toContain(pending[0].id);

    // Verify DB updated
    const ticketRow = await fixture.pool.query('SELECT "admissionStatus" FROM tickets WHERE id = $1', [ticket.id]);
    expect(ticketRow.rows[0].admissionStatus).toBe('inside');

    const logsRow = await fixture.pool.query('SELECT * FROM ticket_admission_logs WHERE "ticketId" = $1', [ticket.id]);
    expect(logsRow.rows).toHaveLength(1);
    expect(logsRow.rows[0].action).toBe('entry');
    expect(logsRow.rows[0].status).toBe('success');

    // Repeated Sync (Idempotency AC-102): sending the exact same pending scan batch again
    const syncRes2 = await syncOfflineAdmissionScans(
      fixture.pool,
      { id: primaryScannerId, role: 'scanner', name: 'หัวหน้าสแกน 1' },
      eventId,
      { scans: pending },
    );

    expect(syncRes2.acknowledgedIds).toContain(pending[0].id);
    expect(syncRes2.syncedCount).toBe(0); // Already synced, no duplicate applied

    // Logs in DB still exactly 1
    const logsAfter = await fixture.pool.query('SELECT * FROM ticket_admission_logs WHERE "ticketId" = $1', [ticket.id]);
    expect(logsAfter.rows).toHaveLength(1);
  });

  it('2. Central revocation conflict: cached-valid ticket refunded centrally then scanned offline creates review case (AC-99, G-44)', async () => {
    const buyerEmail = `sync-buyer-2-${randomUUID().slice(0, 8)}@ticket.invalid`;
    const purchase = await purchaseTicket('คุณทดสอบ ซิงก์ 2', buyerEmail);
    const ticket = purchase.ticket;

    // Primary scanner caches valid ticket in offline dataset
    const dataset = await getOfflineDataset(fixture.pool, { id: primaryScannerId, role: 'scanner' }, eventId);
    const storage = createMockStorage({
      [getOfflineDatasetKey(eventId)]: JSON.stringify(dataset),
    });

    // Central server: buyer requests refund and owner approves it (central revocation)
    const refundReq = await submitRefundRequest(
      fixture.pool,
      {
        verifiedToken: purchase.buyerToken,
        orderId: purchase.orderId,
        ticketIds: [ticket.id],
        reason: 'เปลี่ยนใจขอคืนเงินก่อนเข้างาน',
        now: new Date(),
      },
    );
    expect(refundReq.status).toBe('pending');

    const refundApproval = await approveRefundRequest(
      fixture.pool,
      {
        refundRequestId: refundReq.refundRequestId ?? '',
        reviewerUserId: fixture.ids.owner,
        reviewerName: fixtureAccounts.owner.name,
        reviewerRole: 'owner',
      },
    );
    expect(refundApproval.status).toBe('approved');

    // Verify ticket in DB is now refunded centrally
    const ticketDb = await fixture.pool.query('SELECT status FROM tickets WHERE id = $1', [ticket.id]);
    expect(ticketDb.rows[0].status).toBe('refunded');

    // Primary scanner (offline, holding older snapshot) scans the ticket for entry
    const scanTime = new Date(sessionStartTimeMs + 1 * 3600 * 1000);
    const scanResult = performOfflineAdmissionScan(
      {
        eventId,
        sessionId,
        scannerId: primaryScannerId,
        scannerName: 'หัวหน้าสแกน 1',
        isPrimary: true,
        qrPayloadOrCode: ticket.ticketCode,
        action: 'entry',
        now: scanTime,
      },
      storage,
    );
    expect(scanResult.success).toBe(true); // Cached as valid offline

    const pending = getOfflinePendingScans(eventId, storage);
    expect(pending).toHaveLength(1);

    // Device reconnects and syncs pending scans back to central server
    const syncRes = await syncOfflineAdmissionScans(
      fixture.pool,
      { id: primaryScannerId, role: 'scanner', name: 'หัวหน้าสแกน 1' },
      eventId,
      { scans: pending },
    );

    // AC-99, G-44: conflict detected, acknowledged, logged with reason SYNC_CONFLICT_CENTRAL_REVOKED
    expect(syncRes.conflictsCount).toBe(1);
    expect(syncRes.acknowledgedIds).toContain(pending[0].id);

    // Ticket must STRICTLY remain refunded centrally (not revalidated)
    const ticketCheck = await fixture.pool.query('SELECT status FROM tickets WHERE id = $1', [ticket.id]);
    expect(ticketCheck.rows[0].status).toBe('refunded');

    // Owner reviews conflicts (AC-99)
    const conflicts = await listAdmissionSyncConflicts(fixture.pool, eventId);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const targetConflict = conflicts.find(c => c.ticketId === ticket.id);
    expect(targetConflict).toBeDefined();
    if (!targetConflict) throw new Error('Target conflict not found');
    expect(targetConflict.conflictType).toBe('CENTRAL_REVOKED_OFFLINE_ADMIT');
    expect(targetConflict.status).toBe('pending_review');

    // Owner resolves the conflict
    const resolved = await resolveAdmissionSyncConflict(
      fixture.pool,
      targetConflict.id,
      { id: fixture.ids.owner, role: 'owner', name: 'เจ้าของเว็บ' },
      'ตรวจสอบแล้ว บัตรถูกยกเลิกเนื่องจากคืนเงินสำเร็จ ให้เจ้าหน้าที่หน้างานดูแลเป็นกรณีพิเศษ',
    );
    expect(resolved).toBe(true);

    const conflictsAfter = await listAdmissionSyncConflicts(fixture.pool, eventId);
    const resolvedConflict = conflictsAfter.find(c => c.id === targetConflict.id);
    expect(resolvedConflict?.status).toBe('resolved');
    expect(resolvedConflict?.resolvedBy).toBe('เจ้าของเว็บ');
  });

  it('3. Secondary scanner or unassigned scanner cannot sync offline scans (AC-08, AC-40)', async () => {
    await expect(
      syncOfflineAdmissionScans(
        fixture.pool,
        { id: secondaryScannerId, role: 'scanner', name: 'สแกนรอง 2' },
        eventId,
        { scans: [] },
      ),
    ).rejects.toThrow(/เฉพาะเครื่องหลักประจำงานเท่านั้น/);
  });
});
