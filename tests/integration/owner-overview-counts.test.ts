import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { authFixture } from '../support/auth-fixture';
import { getOwnerOverviewCounts } from '../../src/server/overview';
import { createEventDraft } from '../../src/server/events';
import { ensureTicketDeliverySchema } from '../../src/server/ticket-delivery';
import { ensurePaymentSchema } from '../../src/server/payment';
import { ensureAdmissionSchema } from '../../src/server/admission';

describe('TASK-039: Owner Overview Counts Integration Tests (AC-115, D-17)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;

  beforeAll(async () => {
    fixture = await authFixture('integration');
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('fetches aggregated overview counts directly from database with valid schema', async () => {
    const counts = await getOwnerOverviewCounts(fixture.pool);

    expect(typeof counts.pendingSessions).toBe('number');
    expect(counts.pendingSessions).toBeGreaterThanOrEqual(0);

    expect(typeof counts.pendingRefunds).toBe('number');
    expect(counts.pendingRefunds).toBeGreaterThanOrEqual(0);

    expect(typeof counts.failedEmails).toBe('number');
    expect(counts.failedEmails).toBeGreaterThanOrEqual(0);

    expect(typeof counts.paymentExceptions).toBe('number');
    expect(counts.paymentExceptions).toBeGreaterThanOrEqual(0);

    expect(typeof counts.syncConflicts).toBe('number');
    expect(counts.syncConflicts).toBeGreaterThanOrEqual(0);

    expect(counts.totalPending).toBe(
      counts.pendingSessions +
        counts.pendingRefunds +
        counts.failedEmails +
        counts.paymentExceptions +
        counts.syncConflicts,
    );
  });

  it('dynamically increments counts when pending action items exist across queues', async () => {
    const initialCounts = await getOwnerOverviewCounts(fixture.pool);

    // 1. Insert a pending session
    const startTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const endTime = new Date(Date.now() + 28 * 3600 * 1000).toISOString();
    const event = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      { title: `Event Overview Test ${Date.now()}`, location: 'BKK' },
      [{ startTime, endTime, ticketTypes: [{ name: 'Regular', price: 500, quota: 10 }] }],
    );
    const sessionId = event.sessions[0].id;
    await fixture.pool.query(
      `UPDATE event_sessions SET status = 'pending_approval' WHERE id = $1`,
      [sessionId],
    );

    // 2. Insert a failed email delivery
    await ensureTicketDeliverySchema(fixture.pool);
    const dummyOrderId = randomUUID();
    // Need a dummy order first to satisfy FK
    await fixture.pool.query(
      `INSERT INTO orders (id, "eventId", "sessionId", "buyerName", "buyerEmail", "buyerPhone", subtotal, "customerFee", total, "customerFeeMode", "customerFeeRate", status, "expiresAt")
       VALUES ($1, $2, $3, 'ผู้ซื้อ', 'buyer@test.invalid', '0812345678', 500, 0, 500, 'per_ticket', 0, 'paid', now() + interval '1 day')`,
      [dummyOrderId, event.id, sessionId],
    );
    await fixture.pool.query(
      `INSERT INTO ticket_email_deliveries (id, "orderId", "recipientEmail", status, error)
       VALUES ($1, $2, 'buyer@test.invalid', 'failed', 'SMTP timeout')`,
      [randomUUID(), dummyOrderId],
    );

    // 3. Insert a payment recovery case
    await ensurePaymentSchema(fixture.pool);
    const chargeId = randomUUID();
    await fixture.pool.query(
      `INSERT INTO payment_charges (id, "orderId", amount, currency, status, "qrCodeUrl", "expiresAt")
       VALUES ($1, $2, 50000, 'thb', 'successful', 'https://qr', now())`,
      [chargeId, dummyOrderId],
    );
    await fixture.pool.query(
      `INSERT INTO payment_recovery_cases (id, "orderId", "chargeId", reason, amount, "customerFee", subtotal, status, "providerPaidAt", "orderExpiresAt", "buyerName", "buyerEmail", "buyerPhone")
       VALUES ($1, $2, $3, 'paid_after_deadline', 500, 0, 500, 'pending_review', now(), now(), 'ผู้ซื้อ', 'buyer@test.invalid', '0812345678')`,
      [randomUUID(), dummyOrderId, chargeId],
    );

    // 4. Insert an admission sync conflict
    await ensureAdmissionSchema(fixture.pool);
    const dummyTicketId = randomUUID();
    const dummyOrderItemId = randomUUID();
    const ticketTypeId = event.sessions[0].ticketTypes[0].id;
    await fixture.pool.query(
      `INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
       VALUES ($1, $2, $3, 1, 500, 500)`,
      [dummyOrderItemId, dummyOrderId, ticketTypeId],
    );
    await fixture.pool.query(
      `INSERT INTO tickets (id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId", "ticketCode", "qrPayload", status)
       VALUES ($1, $2, $3, $4, $5, $6, 'TK-TEST', 'payload-unique', 'valid')`,
      [dummyTicketId, dummyOrderId, dummyOrderItemId, event.id, sessionId, ticketTypeId],
    );
    await fixture.pool.query(
      `INSERT INTO admission_sync_conflicts (id, "eventId", "sessionId", "ticketId", "ticketCode", "scannerId", "scannerName", "offlineScanId", action, "scannedAt", "conflictType", "conflictDetails", status)
       VALUES ($1, $2, $3, $4, 'TK-TEST', $5, 'Scanner 1', 'scan1', 'entry', now(), 'CENTRAL_REVOKED', 'Details', 'pending_review')`,
      [randomUUID(), event.id, sessionId, dummyTicketId, fixture.ids.scanner],
    );

    const updatedCounts = await getOwnerOverviewCounts(fixture.pool);

    expect(updatedCounts.pendingSessions).toBe(initialCounts.pendingSessions + 1);
    expect(updatedCounts.failedEmails).toBe(initialCounts.failedEmails + 1);
    expect(updatedCounts.paymentExceptions).toBe(initialCounts.paymentExceptions + 1);
    expect(updatedCounts.syncConflicts).toBe(initialCounts.syncConflicts + 1);
    expect(updatedCounts.totalPending).toBe(initialCounts.totalPending + 4);
  });
});
