import { getDatabasePool } from '@/server/database';
import { getPaymentChargeForOrder, verifyAndProcessPayment } from '@/server/payment';
import { isStripeLiveMode } from '@/server/stripe';

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

    const providerPaidAt = body.providerPaidAt ? new Date(body.providerPaidAt) : undefined;
    const result = await verifyAndProcessPayment(pool, {
      chargeId,
      providerPaidAt,
      actualAmount: body.actualAmount,
      actualCurrency: body.actualCurrency,
    });

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
