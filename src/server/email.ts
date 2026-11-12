// Amazon SES transport and local capture double for email delivery (ADR-0003, TASK-045, AC-126, AC-127)
import { createHash, createHmac } from 'node:crypto';

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

export type EmailTransport = {
  send(message: EmailMessage): Promise<{ id: string }>;
};

export type SesConfig = {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  endpoint?: string;
  from?: string;
};

let customTransport: EmailTransport | null = null;
const capturedEmails: EmailMessage[] = [];

export function setCustomEmailTransport(transport: EmailTransport | null) {
  customTransport = transport;
}

export function getCapturedEmails(): EmailMessage[] {
  return [...capturedEmails];
}

export function clearCapturedEmails() {
  capturedEmails.length = 0;
}

const sha256Hex = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

export function createSesTransport(config?: SesConfig | string): EmailTransport {
  return {
    async send(message: EmailMessage) {
      if (customTransport) {
        return customTransport.send(message);
      }

      const accessKeyId =
        (typeof config === 'string' ? config : config?.accessKeyId) ??
        process.env.SES_ACCESS_KEY_ID?.trim() ??
        process.env.AWS_ACCESS_KEY_ID?.trim() ??
        '';

      const secretAccessKey =
        (typeof config === 'object' ? config.secretAccessKey : undefined) ??
        process.env.SES_SECRET_ACCESS_KEY?.trim() ??
        process.env.AWS_SECRET_ACCESS_KEY?.trim() ??
        (typeof config === 'string' && config ? 'fixture-secret' : '');

      const region =
        (typeof config === 'object' ? config.region : undefined) ??
        process.env.SES_REGION?.trim() ??
        process.env.AWS_REGION?.trim() ??
        'ap-southeast-1';

      // AC-127: local capture/test transport is used when credentials are not configured
      // In production, missing credentials must fail closed and never fall back to local capture
      if (!accessKeyId || !secretAccessKey || accessKeyId === 'test-ses-key') {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            'SES credentials (SES_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY) are required in production',
          );
        }
        if (capturedEmails.length >= 500) {
          capturedEmails.shift();
        }
        capturedEmails.push({ ...message });
        return { id: `local-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
      }

      // SES v2 SendEmail REST API: POST https://email.{region}.amazonaws.com/v2/email/outbound-emails
      const fromAddress =
        process.env.EMAIL_FROM ||
        (typeof config === 'object' ? config?.from : undefined) ||
        message.from;
      const host =
        typeof config === 'object' && config?.endpoint
          ? new URL(config.endpoint).host
          : `email.${region}.amazonaws.com`;
      const endpoint =
        typeof config === 'object' && config?.endpoint
          ? config.endpoint.replace(/\/+$/, '')
          : `https://${host}`;

      const bodyObj: Record<string, { Data: string; Charset: string }> = {};
      if (message.html) {
        bodyObj.Html = { Data: message.html, Charset: 'UTF-8' };
      }
      if (message.text) {
        bodyObj.Text = { Data: message.text, Charset: 'UTF-8' };
      }
      if (!message.html && !message.text) {
        bodyObj.Text = { Data: '', Charset: 'UTF-8' };
      }

      const payload = {
        FromEmailAddress: fromAddress,
        Destination: {
          ToAddresses: [message.to],
        },
        Content: {
          Simple: {
            Subject: {
              Data: message.subject,
              Charset: 'UTF-8',
            },
            Body: bodyObj,
          },
        },
      };

      const payloadString = JSON.stringify(payload);
      const payloadHash = sha256Hex(payloadString);
      const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.slice(0, 8);
      const path = '/v2/email/outbound-emails';

      const signedHeadersObj: Record<string, string> = {
        'content-type': 'application/json',
        host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      };

      const sortedHeaderNames = Object.keys(signedHeadersObj).sort();
      const canonicalHeaders = sortedHeaderNames
        .map((n) => `${n}:${signedHeadersObj[n]}\n`)
        .join('');
      const signedHeaders = sortedHeaderNames.join(';');

      const canonicalRequest = ['POST', path, '', canonicalHeaders, signedHeaders, payloadHash].join(
        '\n',
      );
      const scope = `${dateStamp}/${region}/ses/aws4_request`;
      const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join(
        '\n',
      );

      const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
      const kRegion = hmac(kDate, region);
      const kService = hmac(kRegion, 'ses');
      const kSigning = hmac(kService, 'aws4_request');
      const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

      const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const response = await fetch(`${endpoint}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host,
          'x-amz-date': amzDate,
          'x-amz-content-sha256': payloadHash,
          Authorization: authorization,
        },
        body: payloadString,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SES email delivery failed: ${response.status} ${errorText}`);
      }

      const result = (await response.json()) as { MessageId?: string; id?: string };
      // AC-126: SES provider acceptance returns a message ID, but does not guarantee delivery to inbox
      return { id: result.MessageId || result.id || 'ses-msg-ok' };
    },
  };
}

// Backwards-compatible alias
export const createResendTransport = createSesTransport;

export const emailTransport = createSesTransport();
