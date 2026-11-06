import { getDatabasePool } from '@/server/database';
import { processStripeSuccessEvent } from '@/server/payment';
import {
  verifyStripeWebhookSignature,
  type StripeEvent,
  type StripePaymentIntent,
} from '@/server/stripe';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const pool = getDatabasePool();

  try {
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

    // 3. Process Stripe event
    const result = await processStripeSuccessEvent(pool, { event, rawBody });

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
    return Response.json({ error: 'Internal server error in webhook handler' }, { status: 500 });
  }
}
