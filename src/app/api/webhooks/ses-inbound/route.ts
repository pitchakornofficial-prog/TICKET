import { getDatabasePool } from '@/server/database';
import { PayloadTooLargeError, readBoundedText } from '@/server/http-body';
import {
  ingestDirectInboundEmail,
  ingestSesInboundNotification,
  isValidSnsUrl,
  type SesInboundReceiptPayload,
  type SnsEnvelope,
  verifySnsMessageSignature,
  verifyWebhookSecret,
} from '@/server/inbound-email';

export const runtime = 'nodejs';

const MAX_INBOUND_WEBHOOK_BYTES = 10 * 1024 * 1024; // 10 MiB

function isSnsEnvelope(obj: unknown): obj is SnsEnvelope {
  if (!obj || typeof obj !== 'object') return false;
  const record = obj as Record<string, unknown>;
  return (
    typeof record.Type === 'string' &&
    typeof record.MessageId === 'string' &&
    typeof record.TopicArn === 'string' &&
    typeof record.Message === 'string' &&
    typeof record.Timestamp === 'string'
  );
}

export async function POST(request: Request) {
  try {
    let rawBody: string;
    try {
      rawBody = await readBoundedText(request, MAX_INBOUND_WEBHOOK_BYTES);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return Response.json({ error: 'Payload too large' }, { status: 413 });
      }
      return Response.json({ error: 'Failed to read request body' }, { status: 400 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const expectedSecret = process.env.SES_INBOUND_WEBHOOK_SECRET?.trim() || '';
    const url = new URL(request.url);
    const providedSecret =
      request.headers.get('x-inbound-secret') ||
      url.searchParams.get('secret') ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      '';

    const secretMatched = expectedSecret
      ? verifyWebhookSecret(providedSecret, expectedSecret)
      : false;

    if (expectedSecret && !secretMatched) {
      return Response.json({ error: 'Unauthorized webhook secret' }, { status: 401 });
    }

    // 1. AWS SNS HTTP/HTTPS Envelope (SubscriptionConfirmation / Notification / UnsubscribeConfirmation)
    if (isSnsEnvelope(payload)) {
      const expectedTopicArn = process.env.SES_INBOUND_SNS_TOPIC_ARN?.trim() || '';
      if (process.env.NODE_ENV === 'production' && !expectedTopicArn && !secretMatched) {
        return Response.json(
          {
            error:
              'SES_INBOUND_SNS_TOPIC_ARN or SES_INBOUND_WEBHOOK_SECRET is required in production',
          },
          { status: 503 },
        );
      }
      if (expectedTopicArn && payload.TopicArn !== expectedTopicArn) {
        return Response.json({ error: 'SNS TopicArn mismatch' }, { status: 403 });
      }

      const snsSignatureValid = await verifySnsMessageSignature(payload);
      if (!snsSignatureValid) {
        return Response.json({ error: 'Invalid SNS message signature' }, { status: 403 });
      }

      if (payload.Type === 'SubscriptionConfirmation') {
        if (!payload.SubscribeURL || !isValidSnsUrl(payload.SubscribeURL)) {
          return Response.json({ error: 'Invalid SNS SubscribeURL' }, { status: 400 });
        }
        const confirmRes = await fetch(payload.SubscribeURL, { method: 'GET' });
        if (!confirmRes.ok) {
          return Response.json(
            { error: 'Failed to confirm SNS subscription' },
            { status: 502 },
          );
        }
        return Response.json({ received: true, confirmed: true }, { status: 200 });
      }

      if (payload.Type === 'UnsubscribeConfirmation') {
        return Response.json({ received: true, unsubscribed: true }, { status: 200 });
      }

      if (payload.Type === 'Notification') {
        let sesPayload: SesInboundReceiptPayload;
        try {
          sesPayload = JSON.parse(payload.Message) as SesInboundReceiptPayload;
        } catch {
          return Response.json({ error: 'Invalid SES notification JSON' }, { status: 400 });
        }

        const pool = getDatabasePool();
        const result = await ingestSesInboundNotification(pool, sesPayload, {
          snsMessageId: payload.MessageId,
        });
        return Response.json({ received: true, ...result }, { status: 200 });
      }

      return Response.json({ received: true, ignored: true }, { status: 200 });
    }

    // 2. Direct JSON / Lambda forwarder payload (only permitted when SES_INBOUND_WEBHOOK_SECRET is configured & verified)
    if (!expectedSecret || !secretMatched) {
      return Response.json(
        { error: 'Missing SNS envelope or valid SES_INBOUND_WEBHOOK_SECRET' },
        { status: 401 },
      );
    }

    const pool = getDatabasePool();

    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      if (obj.notificationType === 'Received' || obj.mail || obj.receipt) {
        const result = await ingestSesInboundNotification(
          pool,
          obj as unknown as SesInboundReceiptPayload,
        );
        return Response.json({ received: true, ...result }, { status: 200 });
      }

      if (typeof obj.from === 'string' && (typeof obj.to === 'string' || Array.isArray(obj.to))) {
        const result = await ingestDirectInboundEmail(pool, {
          from: obj.from,
          to: obj.to as string | string[],
          subject: typeof obj.subject === 'string' ? obj.subject : undefined,
          text: typeof obj.text === 'string' ? obj.text : undefined,
          html: typeof obj.html === 'string' ? obj.html : undefined,
          rawMime: typeof obj.rawMime === 'string' ? obj.rawMime : undefined,
          messageId: typeof obj.messageId === 'string' ? obj.messageId : undefined,
        });
        return Response.json({ received: true, ...result }, { status: 200 });
      }
    }

    return Response.json({ error: 'Unsupported inbound payload format' }, { status: 400 });
  } catch (error) {
    console.error('SES inbound webhook error:', error);
    return Response.json(
      { error: 'SES inbound webhook processing failed' },
      { status: 500 },
    );
  }
}
