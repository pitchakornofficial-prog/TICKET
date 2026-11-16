import { getDatabasePool } from '@/server/database';
import {
  processStripeSuccessEvent,
  recordStripeWebhookDelivery,
  updateStripeWebhookDelivery,
} from '@/server/payment';
import {
  verifyStripeWebhookSignature,
  type StripeEvent,
  type StripePaymentIntent,
} from '@/server/stripe';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const pool = getDatabasePool();
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return Response.json(
        { error: 'Stripe webhook secret is not configured' },
        { status: 500 },
      );
    }

    // 1. Signature verification (AC-119)
    const verification = verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
    if (!verification.valid) {
      return Response.json(
        { error: verification.error || 'Invalid webhook signature' },
        { status: 400 },
      );
    }

    // 2. Parse event payload
    let event: StripeEvent<StripePaymentIntent>;
    try {
      event = JSON.parse(rawBody) as StripeEvent<StripePaymentIntent>;
    } catch {
      return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Persist the verified delivery independently so processing failures remain retryable.
    const priorStatus = await recordStripeWebhookDelivery(pool, event, rawBody);
    if (priorStatus === 'processed' || priorStatus === 'ignored') {
      return Response.json({ received: true, status: priorStatus, duplicate: true }, { status: 200 });
    }
    if (priorStatus === 'rejected') {
      return Response.json({ received: true, status: priorStatus, duplicate: true }, { status: 400 });
    }

    // 3. Process Stripe event
    let result: Awaited<ReturnType<typeof processStripeSuccessEvent>>;
    try {
      result = await processStripeSuccessEvent(pool, { event, rawBody });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Stripe event processing failed';
      await updateStripeWebhookDelivery(pool, event.id, 'pending_review', message).catch(() => undefined);
      console.error('Stripe webhook processing error:', error);
      return Response.json(
        { received: true, status: 'pending_review', retry: true },
        { status: 503 },
      );
    }

    if (result.status === 'pending_review') {
      await updateStripeWebhookDelivery(pool, event.id, 'pending_review', result.message);
      return Response.json(
        { received: true, status: 'pending_review', retry: true },
        { status: 503 },
      );
    }

    const inboxStatus = result.status === 'ignored'
      ? 'ignored'
      : result.status === 'mismatch'
        ? 'rejected'
        : 'processed';
    await updateStripeWebhookDelivery(pool, event.id, inboxStatus);

    if (result.status === 'ignored') {
      return Response.json(
        { received: true, ignored: true, message: result.message },
        { status: 200 },
      );
    }

    if (result.status === 'mismatch') {
      return Response.json(
        { error: result.message, status: result.status },
        { status: 400 },
      );
    }

    return Response.json(
      {
        received: true,
        status: result.status,
        orderId: result.orderId,
        ticketCount: result.tickets?.length,
        duplicate: result.duplicate,
        caseId: result.caseId,
        refundRequestId: result.refundRequestId,
        message: result.message,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error('Stripe webhook error:', error);
    return Response.json({ error: 'Stripe webhook is temporarily unavailable; retry delivery' }, { status: 503 });
  }
}
