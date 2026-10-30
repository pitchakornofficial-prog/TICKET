import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const STRIPE_API_VERSION = '2026-10-28.endive';
export const STRIPE_EVENT_API_VERSION = '2026-09-30.endive';

export interface StripePromptPayQrCode {
  data: string;
  hosted_instructions_url: string;
  image_url_png: string;
  image_url_svg: string;
}

export interface StripePaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number; // in satang
  amount_received: number;
  currency: 'thb';
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'requires_capture'
    | 'canceled'
    | 'succeeded';
  client_secret: string;
  livemode: boolean;
  payment_method_types: string[];
  metadata: {
    order_id: string;
    [key: string]: string;
  };
  next_action?: {
    type: 'promptpay_display_qr_code';
    promptpay_display_qr_code: StripePromptPayQrCode;
  } | null;
  created: number; // Unix seconds
}

export interface StripeEvent<T = unknown> {
  id: string;
  object: 'event';
  api_version: string;
  created: number; // Unix seconds (decision time T per G-53 / P5)
  data: {
    object: T;
  };
  livemode: boolean;
  type: string;
  pending_webhooks?: number;
  request?: {
    id: string | null;
    idempotency_key: string | null;
  } | null;
}

export interface StripeWebhookVerificationResult {
  valid: boolean;
  timestamp?: number;
  error?: string;
}

export interface CreatePromptPayIntentParams {
  orderId: string;
  amountSatang: number;
  buyerEmail: string;
  idempotencyKey?: string;
}

export interface StripeClient {
  createPromptPayIntent(params: CreatePromptPayIntentParams): Promise<StripePaymentIntent>;
  retrievePaymentIntent(intentId: string): Promise<StripePaymentIntent>;
  isLiveMode(): boolean;
}

/**
 * Verifies a Stripe webhook signature using HMAC-SHA256 and tolerance check.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds?: number,
): StripeWebhookVerificationResult {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing Stripe-Signature header' };
  }
  if (!secret) {
    return { valid: false, error: 'Missing webhook secret' };
  }

  const items = signatureHeader.split(',').map(s => s.trim());
  let timestamp: number | undefined;
  const signatures: string[] = [];

  for (const item of items) {
    const [key, val] = item.split('=');
    if (key === 't') {
      const parsed = parseInt(val, 10);
      if (!Number.isNaN(parsed)) {
        timestamp = parsed;
      }
    } else if (key === 'v1' && val) {
      signatures.push(val);
    }
  }

  if (timestamp === undefined || signatures.length === 0) {
    return { valid: false, error: 'Unable to extract timestamp and signatures from header' };
  }

  const currentSec = nowSeconds !== undefined ? nowSeconds : Math.floor(Date.now() / 1000);
  if (Math.abs(currentSec - timestamp) > toleranceSeconds) {
    return { valid: false, timestamp, error: 'Timestamp outside the tolerance zone' };
  }

  const payload = `${timestamp}.${rawBody}`;
  const expectedSig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');

  let matched = false;
  for (const sig of signatures) {
    try {
      const sigBuf = Buffer.from(sig, 'hex');
      if (expectedBuf.length === sigBuf.length && timingSafeEqual(expectedBuf, sigBuf)) {
        matched = true;
        break;
      }
    } catch {
      // ignore malformed hex
    }
  }

  if (!matched) {
    return { valid: false, timestamp, error: 'No matching signature found' };
  }

  return { valid: true, timestamp };
}

/**
 * Generates a standard Stripe-Signature header for testing or webhooks.
 */
export function generateStripeSignatureHeader(
  rawBody: string,
  secret: string,
  timestampSeconds?: number,
): string {
  const t = timestampSeconds !== undefined ? timestampSeconds : Math.floor(Date.now() / 1000);
  const payload = `${t}.${rawBody}`;
  const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return `t=${t},v1=${sig}`;
}

/**
 * Constructs an authenticated payment_intent.succeeded StripeEvent.
 */
export function createStripeSuccessEvent(options: {
  intent: StripePaymentIntent;
  eventId?: string;
  created?: number;
  livemode?: boolean;
  apiVersion?: string;
}): StripeEvent<StripePaymentIntent> {
  const created = options.created !== undefined ? options.created : Math.floor(Date.now() / 1000);
  return {
    id: options.eventId || `evt_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    object: 'event',
    api_version: options.apiVersion || STRIPE_EVENT_API_VERSION,
    created,
    data: {
      object: options.intent,
    },
    livemode: options.livemode !== undefined ? options.livemode : options.intent.livemode,
    type: 'payment_intent.succeeded',
  };
}

/**
 * Generates an SVG QR payload for PromptPay test double.
 */
export function generatePromptPaySvg(intentId: string, amountSatang: number): string {
  const amountBaht = (amountSatang / 100).toFixed(2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" style="background:#ffffff;border-radius:8px">
    <rect width="240" height="240" fill="#ffffff"/>
    <rect x="20" y="20" width="60" height="60" fill="#1848ed" rx="4"/>
    <rect x="30" y="30" width="40" height="40" fill="#ffffff" rx="2"/>
    <rect x="40" y="40" width="20" height="20" fill="#1848ed"/>
    <rect x="160" y="20" width="60" height="60" fill="#1848ed" rx="4"/>
    <rect x="170" y="30" width="40" height="40" fill="#ffffff" rx="2"/>
    <rect x="180" y="40" width="20" height="20" fill="#1848ed"/>
    <rect x="20" y="160" width="60" height="60" fill="#1848ed" rx="4"/>
    <rect x="30" y="170" width="40" height="40" fill="#ffffff" rx="2"/>
    <rect x="40" y="180" width="20" height="20" fill="#1848ed"/>
    <rect x="100" y="25" width="40" height="15" fill="#0f172a"/>
    <rect x="95" y="55" width="20" height="25" fill="#0f172a"/>
    <rect x="125" y="50" width="25" height="30" fill="#0f172a"/>
    <rect x="90" y="90" width="60" height="60" fill="#1848ed" rx="4"/>
    <circle cx="120" cy="120" r="16" fill="#ffffff"/>
    <rect x="114" y="110" width="12" height="20" fill="#1848ed"/>
    <rect x="25" y="95" width="55" height="20" fill="#0f172a"/>
    <rect x="30" y="125" width="50" height="25" fill="#0f172a"/>
    <rect x="160" y="95" width="55" height="25" fill="#0f172a"/>
    <rect x="165" y="130" width="50" height="20" fill="#0f172a"/>
    <rect x="95" y="160" width="30" height="55" fill="#0f172a"/>
    <rect x="135" y="160" width="25" height="55" fill="#0f172a"/>
    <rect x="170" y="165" width="50" height="50" fill="#0f172a"/>
    <text x="120" y="232" font-family="sans-serif" font-size="9" fill="#64748b" text-anchor="middle">PromptPay • ${amountBaht} THB • ${intentId.slice(0, 16)}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * In-memory test double conforming to TASK-041 captured Stripe PromptPay contract.
 */
export class StripeContractDouble implements StripeClient {
  private intents = new Map<string, StripePaymentIntent>();
  private intentsByIdempotencyKey = new Map<string, StripePaymentIntent>();
  private livemode = false;
  private failureError: Error | null = null;
  private simulateTimeoutAfterCreate = false;
  private createdCount = 0;

  isLiveMode(): boolean {
    return this.livemode;
  }

  setLiveMode(live: boolean): void {
    this.livemode = live;
  }

  setFailure(error: Error | null): void {
    this.failureError = error;
  }

  simulateTimeoutAfterCreateNext(): void {
    this.simulateTimeoutAfterCreate = true;
  }

  getCreatedIntentsCount(): number {
    return this.createdCount;
  }

  getIntents(): StripePaymentIntent[] {
    return Array.from(this.intents.values());
  }

  reset(): void {
    this.intents.clear();
    this.intentsByIdempotencyKey.clear();
    this.livemode = false;
    this.failureError = null;
    this.simulateTimeoutAfterCreate = false;
    this.createdCount = 0;
  }

  async createPromptPayIntent(params: CreatePromptPayIntentParams): Promise<StripePaymentIntent> {
    if (this.failureError) {
      throw this.failureError;
    }

    if (params.idempotencyKey) {
      const existing = this.intentsByIdempotencyKey.get(params.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const id = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const intent: StripePaymentIntent = {
      id,
      object: 'payment_intent',
      amount: params.amountSatang,
      amount_received: 0,
      currency: 'thb',
      status: 'requires_action',
      client_secret: `${id}_secret_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      livemode: this.livemode,
      payment_method_types: ['promptpay'],
      metadata: {
        order_id: params.orderId,
      },
      next_action: {
        type: 'promptpay_display_qr_code',
        promptpay_display_qr_code: {
          data: `00020101021229370016A000000677010111${params.amountSatang}5802TH53037646304`,
          hosted_instructions_url: `https://payments.stripe.com/promptpay/instructions/test/${id}`,
          image_url_png: `https://api.stripe.com/v1/payment_intents/${id}/qr.png`,
          image_url_svg: generatePromptPaySvg(id, params.amountSatang),
        },
      },
      created: Math.floor(Date.now() / 1000),
    };

    this.createdCount++;
    this.intents.set(id, intent);
    if (params.idempotencyKey) {
      this.intentsByIdempotencyKey.set(params.idempotencyKey, intent);
    }

    if (this.simulateTimeoutAfterCreate) {
      this.simulateTimeoutAfterCreate = false;
      throw new Error('Stripe API request timed out (simulated ambiguous timeout)');
    }

    return intent;
  }

  async retrievePaymentIntent(intentId: string): Promise<StripePaymentIntent> {
    if (this.failureError) {
      throw this.failureError;
    }
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`No such payment_intent: '${intentId}'`);
    }
    return intent;
  }

  setIntentStatus(intentId: string, status: StripePaymentIntent['status']): void {
    const intent = this.intents.get(intentId);
    if (intent) {
      intent.status = status;
    }
  }

  setIntentAmount(intentId: string, amountSatang: number): void {
    const intent = this.intents.get(intentId);
    if (intent) {
      intent.amount = amountSatang;
    }
  }

  setIntentCurrency(intentId: string, currency: 'thb'): void {
    const intent = this.intents.get(intentId);
    if (intent) {
      intent.currency = currency;
    }
  }

  setIntentOrderId(intentId: string, orderId: string): void {
    const intent = this.intents.get(intentId);
    if (intent) {
      intent.metadata.order_id = orderId;
    }
  }

  createSuccessEvent(options: {
    intentId: string;
    created?: number;
    eventId?: string;
  }): StripeEvent<StripePaymentIntent> {
    const intent = this.intents.get(options.intentId);
    if (!intent) {
      throw new Error(`No such payment_intent: '${options.intentId}' in StripeContractDouble`);
    }
    intent.status = 'succeeded';
    intent.amount_received = intent.amount;
    return createStripeSuccessEvent({
      intent,
      eventId: options.eventId,
      created: options.created,
      livemode: this.livemode,
    });
  }
}

/**
 * Production Stripe HTTP client using fetch.
 */
export class HttpStripeClient implements StripeClient {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  isLiveMode(): boolean {
    return this.secretKey.startsWith('sk_live_') || process.env.STRIPE_LIVE_MODE === 'true';
  }

  async createPromptPayIntent(params: CreatePromptPayIntentParams): Promise<StripePaymentIntent> {
    const url = 'https://api.stripe.com/v1/payment_intents';
    const body = new URLSearchParams();
    body.set('amount', params.amountSatang.toString());
    body.set('currency', 'thb');
    body.set('payment_method_types[0]', 'promptpay');
    body.set('metadata[order_id]', params.orderId);
    body.set('confirm', 'true');
    body.set('payment_method_data[type]', 'promptpay');
    body.set('payment_method_data[billing_details][email]', params.buyerEmail);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Stripe-Version': STRIPE_API_VERSION,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Stripe error ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        }
      } catch {
        // use default errorMsg
      }
      throw new Error(`Stripe PromptPay intent creation failed: ${errorMsg}`);
    }

    const data = (await response.json()) as StripePaymentIntent;
    return data;
  }

  async retrievePaymentIntent(intentId: string): Promise<StripePaymentIntent> {
    const url = `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(intentId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Stripe-Version': STRIPE_API_VERSION,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Stripe error ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        }
      } catch {
        // use default errorMsg
      }
      throw new Error(`Stripe retrievePaymentIntent failed: ${errorMsg}`);
    }

    return (await response.json()) as StripePaymentIntent;
  }
}

// Global active client seam (similar to email.ts and storage.ts)
const defaultContractDouble = new StripeContractDouble();
let customStripeClient: StripeClient | null = null;

export function isStripeLiveMode(): boolean {
  if (customStripeClient) {
    return customStripeClient.isLiveMode();
  }
  if (defaultContractDouble.isLiveMode()) {
    return true;
  }
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (key.startsWith('sk_live_') || process.env.STRIPE_LIVE_MODE === 'true') {
    return true;
  }
  return false;
}

export function getStripePublishableKey(): string {
  return process.env.STRIPE_PUBLISHABLE_KEY || '';
}

export function getStripeClient(): StripeClient {
  if (customStripeClient) {
    return customStripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  // If a real secret key is supplied (not empty and not dummy placeholder) and not in test runner
  if (secretKey && !secretKey.startsWith('test_') && secretKey.startsWith('sk_') && process.env.NODE_ENV !== 'test') {
    return new HttpStripeClient(secretKey);
  }

  return defaultContractDouble;
}

export function setStripeClient(client: StripeClient | null): void {
  customStripeClient = client;
}

export function resetStripeClient(): void {
  customStripeClient = null;
  defaultContractDouble.reset();
}
