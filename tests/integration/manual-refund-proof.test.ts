import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture, fixtureAccounts } from '../support/auth-fixture';
import { createEventDraft, approveSession, addScannerToEvent } from '../../src/server/events';
import { requestGuestOtp, verifyGuestOtp } from '../../src/server/guest-otp';
import { createReservation } from '../../src/server/reservation';
import { createPaymentQr, verifyAndProcessPayment } from '../../src/server/payment';
import { recordAdmissionScan, ensureAdmissionSchema } from '../../src/server/admission';
import {
  submitRefundRequest,
  approveRefundRequest,
  recordManualRefundTransfer,
  recordManualRefundFailure,
  getRefundTransferProof,
  getOrderRefundRequests,
} from '../../src/server/refunds';
import { storage } from '../../src/server/storage';
import {
  clearCapturedEmails,
  setCustomEmailTransport,
  getCapturedEmails,
} from '../../src/server/email';

describe('TASK-023: Manual Refund Transfer & Private Proof Integration Tests (AC-37, AC-92, AC-93)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    setCustomEmailTransport(null);
    if (fixture) await fixture.cleanup();
  });

  async function purchaseAndApproveRefund(quantity = 2) {
    clearCapturedEmails();

    const sessionStartTime = new Date(Date.now() + 240 * 3600 * 1000);
    const sessionEndTime = new Date(sessionStartTime.getTime() + 4 * 3600 * 1000);

    const eventDraft = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      {
        title: `คอนเสิร์ต บันทึกโอนเงินคืน ${Date.now()}`,
        description: 'งานแสดงดนตรีสำหรับทดสอบ manual refund transfer & proof',
        location: 'Impact Arena',
        posterUrl: undefined,
      },
      [
        {
          startTime: sessionStartTime.toISOString(),
          endTime: sessionEndTime.toISOString(),
          ticketTypes: [{ name: 'VIP Zone', price: 2000, quota: 20 }],
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
    await ensureAdmissionSchema(fixture.pool);

    const guestEmail = `buyer-transfer-${Date.now()}@ticket.invalid`;
    const guestPhone = '0812345678';
    const guestName = 'ผู้ซื้อทดสอบโอนคืน';
    const buyer = { name: guestName, email: guestEmail, phone: guestPhone };

    const reqRes = await requestGuestOtp(fixture.pool, {
      buyer,
      purpose: 'checkout',
      now: new Date(),
    });
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

    const reservation = await createReservation(
      fixture.pool,
      {
        verifiedToken: buyerToken,
        eventId: eventDraft.id,
        sessionId,
        items: [{ ticketTypeId, quantity }],
      },
      new Date(),
    );

    const charge = await createPaymentQr(
      fixture.pool,
      {
        orderId: reservation.id,
        verifiedToken: buyerToken,
      },
      new Date(),
    );

    const payRes = await verifyAndProcessPayment(
      fixture.pool,
      {
        chargeId: charge.id,
        providerPaidAt: new Date(),
        actualAmount: charge.amount,
        actualCurrency: 'thb',
      },
      new Date(),
    );
    expect(payRes.success).toBe(true);

    const tRes = await fixture.pool.query<{
      id: string;
      ticketCode: string;
      status: string;
    }>(
      'SELECT id, "ticketCode", status FROM tickets WHERE "orderId" = $1 ORDER BY "ticketCode"',
      [reservation.id],
    );

    // Submit refund request
    const ticketIdsToRefund = [tRes.rows[0].id];
    const refundSubmission = await submitRefundRequest(fixture.pool, {
      verifiedToken: buyerToken,
      orderId: reservation.id,
      ticketIds: ticketIdsToRefund,
      reason: 'ไม่สะดวกเดินทางไปร่วมงาน',
      bankName: 'ธนาคารกสิกรไทย',
      bankAccountNo: '123-4-56789-0',
      bankAccountName: guestName,
      now: new Date(),
    });
    expect(refundSubmission.success).toBe(true);

    // Approve refund request (TASK-022)
    const approveResult = await approveRefundRequest(fixture.pool, {
      refundRequestId: refundSubmission.refundRequestId ?? '',
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'Owner Admin',
      reviewerRole: 'owner',
      now: new Date(),
    });
    expect(approveResult.success).toBe(true);

    return {
      orderId: reservation.id,
      sessionId,
      sessionStartTime,
      eventId: eventDraft.id,
      guestEmail,
      refundRequestId: refundSubmission.refundRequestId ?? '',
      refundedTicket: tRes.rows[0],
      retainedTicket: tRes.rows[1],
    };
  }

  it('records manual refund transfer, settles liability, and verifies idempotency (AC-37, AC-107, G-36)', async () => {
    const data = await purchaseAndApproveRefund(2);

    // Check initial liability status: unpaid
    const liabilityBefore = await fixture.pool.query<{ status: string; amount: number }>(
      `SELECT status, amount FROM refund_liabilities WHERE "refundRequestId" = $1`,
      [data.refundRequestId],
    );
    expect(liabilityBefore.rows[0].status).toBe('unpaid');
    expect(Number(liabilityBefore.rows[0].amount)).toBe(2000);

    // Store private proof in storage
    const proofKey = `proofs/transfer-slip-${data.refundRequestId}.png`;
    await storage.put(proofKey, Buffer.from('sample-slip-image-binary'), 'image/png', 'private');

    // Owner records manual refund transfer (AC-37)
    const transferResult = await recordManualRefundTransfer(fixture.pool, {
      refundRequestId: data.refundRequestId,
      transferredAmount: 2000,
      transferProofKey: proofKey,
      transferProofUrl: `/api/media/${proofKey}`,
      transferNote: 'โอนผ่าน KBank เข้าบัญชีผู้ซื้อเรียบร้อย',
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'Owner Admin',
      reviewerRole: 'owner',
    });

    expect(transferResult.success).toBe(true);
    expect(transferResult.status).toBe('completed');
    expect(transferResult.transferredAmount).toBe(2000);

    // Check refund_requests table
    const reqRow = await fixture.pool.query<{
      status: string;
      transferredAmount: number;
      transferProofKey: string;
      transferNote: string;
      transferredAt: Date;
    }>(
      `SELECT status, "transferredAmount", "transferProofKey", "transferNote", "transferredAt"
       FROM refund_requests WHERE id = $1`,
      [data.refundRequestId],
    );
    expect(reqRow.rows[0].status).toBe('completed');
    expect(Number(reqRow.rows[0].transferredAmount)).toBe(2000);
    expect(reqRow.rows[0].transferProofKey).toBe(proofKey);
    expect(reqRow.rows[0].transferNote).toBe('โอนผ่าน KBank เข้าบัญชีผู้ซื้อเรียบร้อย');
    expect(reqRow.rows[0].transferredAt).toBeTruthy();

    // Check refund_liabilities settled (AC-37)
    const liabilityAfter = await fixture.pool.query<{ status: string; settledAt: Date }>(
      `SELECT status, "settledAt" FROM refund_liabilities WHERE "refundRequestId" = $1`,
      [data.refundRequestId],
    );
    expect(liabilityAfter.rows[0].status).toBe('settled');
    expect(liabilityAfter.rows[0].settledAt).toBeTruthy();

    // Repeated call idempotency (AC-107, G-36)
    const repeatResult = await recordManualRefundTransfer(fixture.pool, {
      refundRequestId: data.refundRequestId,
      transferredAmount: 2000,
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'Owner Admin',
      reviewerRole: 'owner',
    });
    expect(repeatResult.success).toBe(true);
    expect(repeatResult.status).toBe('completed');
    expect(repeatResult.alreadyCompleted).toBe(true);
  });

  it('records transfer failure, keeps liability unpaid, preserves revoked tickets, and allows retry (AC-93)', async () => {
    const data = await purchaseAndApproveRefund(2);

    // Record transfer failure (AC-93)
    const failResult = await recordManualRefundFailure(fixture.pool, {
      refundRequestId: data.refundRequestId,
      failureReason: 'เลขที่บัญชี 123-4-56789-0 ไม่พบในระบบธนาคารปลายทาง',
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'Owner Admin',
      reviewerRole: 'owner',
    });

    expect(failResult.success).toBe(true);
    expect(failResult.status).toBe('approved');
    expect(failResult.liabilityStatus).toBe('unpaid');

    // Verify DB state
    const reqRow = await fixture.pool.query<{
      status: string;
      transferFailureReason: string;
    }>(
      `SELECT status, "transferFailureReason" FROM refund_requests WHERE id = $1`,
      [data.refundRequestId],
    );
    expect(reqRow.rows[0].status).toBe('approved');
    expect(reqRow.rows[0].transferFailureReason).toContain('ไม่พบในระบบธนาคารปลายทาง');

    // Liability remains unpaid (AC-93)
    const liabilityRow = await fixture.pool.query<{ status: string }>(
      `SELECT status FROM refund_liabilities WHERE "refundRequestId" = $1`,
      [data.refundRequestId],
    );
    expect(liabilityRow.rows[0].status).toBe('unpaid');

    // Revoked ticket remains revoked
    const ticketRow = await fixture.pool.query<{ status: string }>(
      `SELECT status FROM tickets WHERE id = $1`,
      [data.refundedTicket.id],
    );
    expect(ticketRow.rows[0].status).toBe('refunded');

    // Scanner scan is still rejected (AC-89, AC-101)
    const scanResult = await recordAdmissionScan(fixture.pool, {
      sessionId: data.sessionId,
      qrPayloadOrCode: data.refundedTicket.ticketCode,
      scannerId: fixture.ids.scanner,
      scannerName: fixtureAccounts.scanner.name,
      scannerRole: 'scanner',
      action: 'entry',
      now: data.sessionStartTime,
    });
    expect(scanResult.success).toBe(false);
    expect(scanResult.reason).toBe('TICKET_REFUNDED');

    // Retry transfer with correct bank details
    const retryTransfer = await recordManualRefundTransfer(fixture.pool, {
      refundRequestId: data.refundRequestId,
      transferredAmount: 2000,
      transferNote: 'โอนซ้ำสำเร็จหลังจากได้รับเลขบัญชีใหม่',
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'Owner Admin',
      reviewerRole: 'owner',
    });
    expect(retryTransfer.success).toBe(true);
    expect(retryTransfer.status).toBe('completed');

    const settledLiability = await fixture.pool.query<{ status: string }>(
      `SELECT status FROM refund_liabilities WHERE "refundRequestId" = $1`,
      [data.refundRequestId],
    );
    expect(settledLiability.rows[0].status).toBe('settled');
  });

  it('enforces private storage boundary: only owner can retrieve proof file, forbidden for organizer/scanner/buyer (AC-92)', async () => {
    const data = await purchaseAndApproveRefund(2);

    const proofKey = `proofs/private-slip-${data.refundRequestId}.pdf`;
    await storage.put(proofKey, Buffer.from('secret-pdf-slip-content'), 'application/pdf', 'private');

    await recordManualRefundTransfer(fixture.pool, {
      refundRequestId: data.refundRequestId,
      transferredAmount: 2000,
      transferProofKey: proofKey,
      reviewerUserId: fixture.ids.owner,
      reviewerName: 'Owner Admin',
      reviewerRole: 'owner',
    });

    // Owner can download proof
    const ownerProof = await getRefundTransferProof(fixture.pool, {
      refundRequestId: data.refundRequestId,
      actorRole: 'owner',
    });
    expect(ownerProof.success).toBe(true);
    expect(ownerProof.contentType).toBe('application/pdf');
    expect(ownerProof.data?.toString()).toBe('secret-pdf-slip-content');

    // Organizer forbidden
    const orgProof = await getRefundTransferProof(fixture.pool, {
      refundRequestId: data.refundRequestId,
      actorRole: 'organizer',
    });
    expect(orgProof.success).toBe(false);
    expect(orgProof.code).toBe('FORBIDDEN');

    // Scanner forbidden
    const scannerProof = await getRefundTransferProof(fixture.pool, {
      refundRequestId: data.refundRequestId,
      actorRole: 'scanner',
    });
    expect(scannerProof.success).toBe(false);
    expect(scannerProof.code).toBe('FORBIDDEN');

    // Buyer forbidden
    const buyerProof = await getRefundTransferProof(fixture.pool, {
      refundRequestId: data.refundRequestId,
      actorRole: 'buyer',
    });
    expect(buyerProof.success).toBe(false);
    expect(buyerProof.code).toBe('FORBIDDEN');

    // Buyer public endpoint strips transferProofKey & transferProofUrl (AC-92)
    const publicRequests = await getOrderRefundRequests(fixture.pool, data.orderId);
    expect(publicRequests.length).toBe(1);
    expect(publicRequests[0].status).toBe('completed');
    expect(publicRequests[0].transferredAmount).toBe(2000);
    expect((publicRequests[0] as unknown as { transferProofKey?: string }).transferProofKey).toBeUndefined();
    expect((publicRequests[0] as unknown as { transferProofUrl?: string }).transferProofUrl).toBeUndefined();
  });
});
