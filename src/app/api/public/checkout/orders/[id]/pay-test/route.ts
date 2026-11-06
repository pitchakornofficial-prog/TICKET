import { createSafeErrorResponse } from '@/server/api-error';
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

  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { message: 'เส้นทางนี้ถูกปิดใช้งานในสภาพแวดล้อม Production' },
      { status: 404 },
    );
  }

  if (process.env.ENABLE_PAY_TEST !== 'true') {
    return Response.json(
      { message: 'เส้นทางทดสอบการชำระเงินถูกปิดใช้งาน (ENABLE_PAY_TEST ต้องเป็น true)' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));

    const verifiedToken =
      body.verifiedToken ||
      body.orderToken ||
      request.headers.get('x-guest-token') ||
      request.headers.get('x-order-token') ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      '';

    if (!verifiedToken) {
      return Response.json(
        { message: 'กรุณาระบุ order token หรือยืนยันตัวตนผ่าน OTP ก่อนทดสอบการชำระเงิน (AC-12)' },
        { status: 403 },
      );
    }

    // Find active charge if not explicitly supplied
    let chargeId = body.chargeId;
    let activeCharge: Awaited<ReturnType<typeof getPaymentChargeForOrder>> = null;
    activeCharge = await getPaymentChargeForOrder(pool, orderId, verifiedToken);
    if (!activeCharge) {
      return Response.json({ message: 'ยังไม่มีรายการชำระเงินสำหรับคำสั่งซื้อนี้' }, { status: 404 });
    }
    if (!chargeId) {
      chargeId = activeCharge.id;
    }

    if (activeCharge.livemode) {
      return Response.json(
        { message: 'ไม่อนุญาตให้ใช้เส้นทางทดสอบการชำระเงินสำหรับรายการ Live (AC-123)' },
        { status: 403 },
      );
    }

    const stripe = getStripeClient();
    if (stripe instanceof StripeContractDouble) {
      stripe.setIntentStatus(chargeId, 'succeeded');
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
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการประมวลผลการชำระเงิน', {
      defaultStatus: 500,
      statusResolver: (msg) => (msg.includes('สิทธิ์') || msg.includes('OTP') ? 403 : 500),
    });
  }
}
