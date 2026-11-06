import { describe, expect, it, vi } from 'vitest';
import { POST as handleRefundRequest } from '../../src/app/api/public/orders/[id]/refund-request/route';
import * as refundsModule from '../../src/server/refunds';

vi.mock('@/server/database', () => ({
  getDatabasePool: () => ({}),
}));

describe('POST /api/public/orders/[id]/refund-request Route Security', () => {
  it('does not forward client-supplied "now" timestamp to submitRefundRequest', async () => {
    let capturedInput: refundsModule.RefundRequestInput | null = null;
    vi.spyOn(refundsModule, 'submitRefundRequest').mockImplementation(async (_pool, input) => {
      capturedInput = input;
      return {
        success: true,
        refundRequestId: 'ref-123',
        requestedAmount: 1500,
        ticketCount: 1,
        status: 'pending',
      };
    });

    const maliciousClientNow = '2020-01-01T00:00:00.000Z';
    const request = new Request('http://localhost/api/public/orders/ORD-001/refund-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guest-session': 'valid-guest-token',
      },
      body: JSON.stringify({
        ticketIds: ['tkt-1'],
        reason: 'Client supplied forged now timestamp',
        bankName: 'ธนาคารไทยพาณิชย์',
        bankAccountNo: '1234567890',
        bankAccountName: 'นายทดสอบ',
        now: maliciousClientNow,
      }),
    });

    const response = await handleRefundRequest(request, {
      params: Promise.resolve({ id: 'ORD-001' }),
    });

    expect(response.status).toBe(201);
    const finalInput = capturedInput as refundsModule.RefundRequestInput | null;
    expect(finalInput).not.toBeNull();
    // input.now must NOT be the client-supplied forged timestamp
    expect(finalInput?.now).toBeUndefined();
  });

  it('rejects with 401 when session token is missing', async () => {
    const request = new Request('http://localhost/api/public/orders/ORD-001/refund-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketIds: ['tkt-1'],
        reason: 'No token',
      }),
    });

    const response = await handleRefundRequest(request, {
      params: Promise.resolve({ id: 'ORD-001' }),
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.message).toContain('OTP');
  });
});
