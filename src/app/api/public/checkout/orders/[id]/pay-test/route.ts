import { getDatabasePool } from '@/server/database';
import { getPaymentChargeForOrder, processStripeSuccessEvent } from '@/server/payment';
import {
  getStripeClient,
  isStripeLiveMode,
  createStripeSuccessEvent,
  StripeContractDouble,
} from '@/server/stripe';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const pool = getDatabasePool();

  if (isStripeLiveMode()) {
    return Response.json(
      { message: 'ไม่อนุญาตให้ใช้เส้นทางทดสอบการชำระเงินใน Live Mode (AC-123)' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));

    // Find active charge if not explicitly supplied
    let chargeId = body.chargeId;
    let activeCharge: Awaited<ReturnType<typeof getPaymentChargeForOrder>> = null;
    if (!chargeId) {
      activeCharge = await getPaymentChargeForOrder(pool, orderId);
      if (!activeCharge) {
        return Response.json({ message: 'ยังไม่มีรายการชำระเงินสำหรับคำสั่งซื้อนี้' }, { status: 404 });
      }
      chargeId = activeCharge.id;
    } else {
      activeCharge = await getPaymentChargeForOrder(pool, orderId);
    }

    if (activeCharge?.livemode) {
      return Response.json(
        { message: 'ไม่อนุญาตให้ใช้เส้นทางทดสอบการชำระเงินสำหรับรายการ Live (AC-123)' },
        { status: 403 },
      );
    }

    const stripe = getStripeClient();
    if (stripe instanceof StripeContractDouble) {
      stripe.setIntentStatus(chargeId, 'succeeded');
      if (body.actualAmount !== undefined) {
        stripe.setIntentAmount(chargeId, body.actualAmount);
      }
      if (body.actualCurrency !== undefined) {
        stripe.setIntentCurrency(chargeId, body.actualCurrency as 'thb');
      }
    }

    const intent = await stripe.retrievePaymentIntent(chargeId);
    const providerPaidAt = body.providerPaidAt ? new Date(body.providerPaidAt) : undefined;
    const createdSeconds = providerPaidAt
      ? Math.floor(providerPaidAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const testEvent = createStripeSuccessEvent({
      intent,
      created: createdSeconds,
      livemode: false,
    });

    const result = await processStripeSuccessEvent(pool, { event: testEvent });

    const isProcessed =
      result.status === 'paid' ||
      result.status === 'paid_after_deadline' ||
      result.status === 'insufficient_quota' ||
      result.status === 'cancelled_session_refund_face_value' ||
      result.status === 'cancelled_session_refund_full';
    const status = isProcessed ? 200 : 400;
    return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการประมวลผลการชำระเงิน';
    return Response.json({ message }, { status: 500 });
  }
}
