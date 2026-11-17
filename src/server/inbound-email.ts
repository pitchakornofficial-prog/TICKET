import { createHash, createHmac, createVerify, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { emailTransport, type EmailTransport } from './email.ts';
import {
  decodeRfc2047,
  parseEmailAddress,
  parseRawMimeEmail,
  type ParsedMimeAttachment,
} from './mime-parser.ts';

export const DEFAULT_ALLOWED_INBOUND_RECIPIENTS = [
  'support@phatysd.me',
  'organizer@phatysd.me',
  'organizer-support@phatysd.me',
] as const;

export type InboundEmailStatus = 'unread' | 'read' | 'replied' | 'archived';

export interface InboundEmailRecord {
  id: string;
  sesMessageId: string | null;
  snsMessageId: string | null;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  allRecipients: string[];
  subject: string;
  textBody: string;
  htmlBody: string | null;
  internetMessageId: string | null;
  replyToAddress: string | null;
  attachmentsMeta: ParsedMimeAttachment[];
  spamVerdict: string | null;
  virusVerdict: string | null;
  status: InboundEmailStatus;
  receivedAt: string;
  readAt: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboundEmailReplyRecord {
  id: string;
  inboundEmailId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  sesMessageId: string | null;
  sentByUserId: string | null;
  sentByEmail: string | null;
  sentAt: string;
}

export interface InboundEmailCounts {
  all: number;
  unread: number;
  read: number;
  replied: number;
  archived: number;
}

export interface SnsEnvelope {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation' | string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
  SubscribeURL?: string;
  Token?: string;
}

export interface SesInboundReceiptPayload {
  notificationType?: string;
  mail?: {
    timestamp?: string;
    source?: string;
    messageId?: string;
    destination?: string[];
    commonHeaders?: {
      from?: string[];
      to?: string[];
      replyTo?: string[];
      subject?: string;
      messageId?: string;
      date?: string;
    };
  };
  receipt?: {
    timestamp?: string;
    recipients?: string[];
    spamVerdict?: { status?: string };
    virusVerdict?: { status?: string };
    action?: {
      type?: string;
      bucketName?: string;
      objectKey?: string;
      topicArn?: string;
    };
  };
  content?: string;
}

export function getAllowedInboundRecipients(): string[] {
  const raw = process.env.SES_INBOUND_ALLOWED_RECIPIENTS?.trim();
  if (!raw) return [...DEFAULT_ALLOWED_INBOUND_RECIPIENTS];
  const parsed = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_INBOUND_RECIPIENTS];
}

export function verifyWebhookSecret(providedSecret: string | null | undefined, expectedSecret: string): boolean {
  if (!providedSecret || !expectedSecret) return false;
  const a = Buffer.from(providedSecret, 'utf8');
  const b = Buffer.from(expectedSecret, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Validates that an SNS SigningCertURL or SubscribeURL points strictly to AWS SNS HTTPS endpoints (SSRF protection).
 */
export function isValidSnsUrl(rawUrl: string | undefined | null, options?: { requirePem?: boolean }): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (!/^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i.test(url.hostname)) return false;
    if (options?.requirePem && !url.pathname.endsWith('.pem')) return false;
    return true;
  } catch {
    return false;
  }
}

export function buildSnsCanonicalSigningString(msg: SnsEnvelope): string {
  const fields: Array<[string, string | undefined]> =
    msg.Type === 'Notification'
      ? [
          ['Message', msg.Message],
          ['MessageId', msg.MessageId],
          ['Subject', msg.Subject],
          ['Timestamp', msg.Timestamp],
          ['TopicArn', msg.TopicArn],
          ['Type', msg.Type],
        ]
      : [
          ['Message', msg.Message],
          ['MessageId', msg.MessageId],
          ['SubscribeURL', msg.SubscribeURL],
          ['Timestamp', msg.Timestamp],
          ['Token', msg.Token],
          ['TopicArn', msg.TopicArn],
          ['Type', msg.Type],
        ];

  return fields
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}\n${value}\n`)
    .join('');
}

const snsCertCache = new Map<string, string>();

export async function verifySnsMessageSignature(
  msg: SnsEnvelope,
  options?: { fetchCert?: (url: string) => Promise<string> },
): Promise<boolean> {
  if (!msg.Signature || !msg.SigningCertURL) return false;
  if (!isValidSnsUrl(msg.SigningCertURL, { requirePem: true })) return false;

  const sigVersion = msg.SignatureVersion || '1';
  const algorithm = sigVersion === '2' ? 'RSA-SHA256' : sigVersion === '1' ? 'RSA-SHA1' : null;
  if (!algorithm) return false;

  let certPem = snsCertCache.get(msg.SigningCertURL);
  if (!certPem) {
    if (options?.fetchCert) {
      certPem = await options.fetchCert(msg.SigningCertURL);
    } else {
      const res = await fetch(msg.SigningCertURL, { method: 'GET' });
      if (!res.ok) return false;
      certPem = await res.text();
    }
    if (!certPem.includes('BEGIN CERTIFICATE')) return false;
    if (snsCertCache.size >= 32) {
      const firstKey = snsCertCache.keys().next().value;
      if (firstKey) snsCertCache.delete(firstKey);
    }
    snsCertCache.set(msg.SigningCertURL, certPem);
  }

  try {
    const verifier = createVerify(algorithm);
    verifier.update(buildSnsCanonicalSigningString(msg), 'utf8');
    return verifier.verify(certPem, msg.Signature, 'base64');
  } catch {
    return false;
  }
}

const sha256Hex = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

function encodeS3ObjectKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Fetches raw MIME email from S3 when SES Receipt Rule stores full content in S3 instead of inline SNS.
 */
export async function fetchRawEmailFromS3(params: {
  bucketName: string;
  objectKey: string;
  region?: string;
}): Promise<string | null> {
  const configuredBucket = process.env.SES_INBOUND_S3_BUCKET?.trim();
  if (configuredBucket && configuredBucket !== params.bucketName) {
    throw new Error('SES inbound S3 bucket mismatch');
  }

  const accessKeyId =
    process.env.SES_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || '';
  const secretAccessKey =
    process.env.SES_SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim() || '';
  const region =
    params.region ||
    process.env.SES_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    'ap-southeast-1';

  if (!accessKeyId || !secretAccessKey || accessKeyId === 'test-ses-key') {
    return null;
  }

  const host = `${params.bucketName}.s3.${region}.amazonaws.com`;
  const path = `/${encodeS3ObjectKey(params.objectKey)}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex('');

  const headersObj: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sortedNames = Object.keys(headersObj).sort();
  const canonicalHeaders = sortedNames.map((k) => `${k}:${headersObj[k]}\n`).join('');
  const signedHeaders = sortedNames.join(';');
  const canonicalRequest = ['GET', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const res = await fetch(`https://${host}${path}`, {
    method: 'GET',
    headers: {
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch S3 inbound email: ${res.status}`);
  }
  return res.text();
}

const inboundEmailSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureInboundEmailSchema(pool: Pool): Promise<void> {
  const existing = inboundEmailSchemaPromises.get(pool);
  if (existing) return existing;
  const promise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inbound_emails (
        id TEXT PRIMARY KEY,
        "sesMessageId" TEXT UNIQUE,
        "snsMessageId" TEXT,
        "fromAddress" TEXT NOT NULL,
        "fromName" TEXT NOT NULL DEFAULT '',
        "toAddress" TEXT NOT NULL,
        "allRecipients" TEXT NOT NULL DEFAULT '[]',
        subject TEXT NOT NULL DEFAULT '',
        "textBody" TEXT NOT NULL DEFAULT '',
        "htmlBody" TEXT,
        "internetMessageId" TEXT,
        "replyToAddress" TEXT,
        "attachmentsMeta" TEXT NOT NULL DEFAULT '[]',
        "spamVerdict" TEXT,
        "virusVerdict" TEXT,
        status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied', 'archived')),
        "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "readAt" TIMESTAMPTZ,
        "repliedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_inbound_emails_status_received
        ON inbound_emails(status, "receivedAt" DESC);
      CREATE INDEX IF NOT EXISTS idx_inbound_emails_to_received
        ON inbound_emails("toAddress", "receivedAt" DESC);

      CREATE TABLE IF NOT EXISTS inbound_email_replies (
        id TEXT PRIMARY KEY,
        "inboundEmailId" TEXT NOT NULL REFERENCES inbound_emails(id) ON DELETE CASCADE,
        "fromAddress" TEXT NOT NULL,
        "toAddress" TEXT NOT NULL,
        subject TEXT NOT NULL,
        "bodyText" TEXT NOT NULL,
        "sesMessageId" TEXT,
        "sentByUserId" TEXT,
        "sentByEmail" TEXT,
        "sentAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_inbound_email_replies_parent
        ON inbound_email_replies("inboundEmailId", "sentAt" ASC);
    `);
  })().catch((err) => {
    inboundEmailSchemaPromises.delete(pool);
    throw err;
  });
  inboundEmailSchemaPromises.set(pool, promise);
  await promise;
}

function resolveMatchedRecipient(candidates: string[], allowed: string[]): string | null {
  const normalizedCandidates = candidates
    .map((c) => parseEmailAddress(c).address.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.includes('*')) {
    return normalizedCandidates[0] || null;
  }

  for (const cand of normalizedCandidates) {
    if (allowed.includes(cand)) return cand;
  }
  return null;
}

function mapInboundEmailRow(row: Record<string, unknown>): InboundEmailRecord {
  const parseJsonArray = <T,>(raw: unknown, fallback: T[]): T[] => {
    if (Array.isArray(raw)) return raw as T[];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const toIso = (val: unknown): string | null => {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    const d = new Date(String(val));
    return Number.isNaN(d.getTime()) ? String(val) : d.toISOString();
  };

  return {
    id: String(row.id),
    sesMessageId: row.sesMessageId ? String(row.sesMessageId) : null,
    snsMessageId: row.snsMessageId ? String(row.snsMessageId) : null,
    fromAddress: String(row.fromAddress),
    fromName: String(row.fromName ?? ''),
    toAddress: String(row.toAddress),
    allRecipients: parseJsonArray<string>(row.allRecipients, []),
    subject: String(row.subject ?? ''),
    textBody: String(row.textBody ?? ''),
    htmlBody: row.htmlBody ? String(row.htmlBody) : null,
    internetMessageId: row.internetMessageId ? String(row.internetMessageId) : null,
    replyToAddress: row.replyToAddress ? String(row.replyToAddress) : null,
    attachmentsMeta: parseJsonArray<ParsedMimeAttachment>(row.attachmentsMeta, []),
    spamVerdict: row.spamVerdict ? String(row.spamVerdict) : null,
    virusVerdict: row.virusVerdict ? String(row.virusVerdict) : null,
    status: (row.status as InboundEmailStatus) || 'unread',
    receivedAt: toIso(row.receivedAt) || new Date().toISOString(),
    readAt: toIso(row.readAt),
    repliedAt: toIso(row.repliedAt),
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString(),
  };
}

function mapReplyRow(row: Record<string, unknown>): InboundEmailReplyRecord {
  const sentAt = row.sentAt instanceof Date ? row.sentAt.toISOString() : String(row.sentAt);
  return {
    id: String(row.id),
    inboundEmailId: String(row.inboundEmailId),
    fromAddress: String(row.fromAddress),
    toAddress: String(row.toAddress),
    subject: String(row.subject),
    bodyText: String(row.bodyText),
    sesMessageId: row.sesMessageId ? String(row.sesMessageId) : null,
    sentByUserId: row.sentByUserId ? String(row.sentByUserId) : null,
    sentByEmail: row.sentByEmail ? String(row.sentByEmail) : null,
    sentAt,
  };
}

export async function ingestSesInboundNotification(
  pool: Pool,
  sesPayload: SesInboundReceiptPayload,
  options?: {
    snsMessageId?: string | null;
    fetchS3RawEmail?: (params: { bucketName: string; objectKey: string }) => Promise<string | null>;
  },
): Promise<
  | { status: 'stored'; id: string; toAddress: string }
  | { status: 'duplicate'; sesMessageId: string }
  | { status: 'ignored'; reason: string }
> {
  if (sesPayload.notificationType && sesPayload.notificationType !== 'Received') {
    return { status: 'ignored', reason: `unsupported_notification_type:${sesPayload.notificationType}` };
  }

  await ensureInboundEmailSchema(pool);

  let rawContent = sesPayload.content || null;
  if (
    !rawContent &&
    sesPayload.receipt?.action?.type === 'S3' &&
    sesPayload.receipt.action.bucketName &&
    sesPayload.receipt.action.objectKey
  ) {
    const fetcher = options?.fetchS3RawEmail ?? fetchRawEmailFromS3;
    rawContent = await fetcher({
      bucketName: sesPayload.receipt.action.bucketName,
      objectKey: sesPayload.receipt.action.objectKey,
    }).catch((err) => {
      console.error('[TICKET] Unable to fetch SES inbound S3 object:', err);
      return null;
    });
  }

  const parsedMime = rawContent ? parseRawMimeEmail(rawContent) : null;
  const candidateRecipients = [
    ...(sesPayload.receipt?.recipients ?? []),
    ...(sesPayload.mail?.destination ?? []),
    ...(sesPayload.mail?.commonHeaders?.to ?? []),
    ...(parsedMime?.to.map((t) => t.address) ?? []),
  ];

  const allowed = getAllowedInboundRecipients();
  const matchedRecipient = resolveMatchedRecipient(candidateRecipients, allowed);
  if (!matchedRecipient) {
    return { status: 'ignored', reason: 'recipient_not_allowed' };
  }

  const headerFrom = sesPayload.mail?.commonHeaders?.from?.[0]
    ? parseEmailAddress(sesPayload.mail.commonHeaders.from[0])
    : null;
  const envelopeFrom = sesPayload.mail?.source ? parseEmailAddress(sesPayload.mail.source) : null;

  const fromAddress =
    parsedMime?.from.address || headerFrom?.address || envelopeFrom?.address || 'unknown@unknown.invalid';
  const fromName = parsedMime?.from.name || headerFrom?.name || '';

  const replyToHeader = sesPayload.mail?.commonHeaders?.replyTo?.[0]
    ? parseEmailAddress(sesPayload.mail.commonHeaders.replyTo[0]).address
    : null;
  const replyToAddress = parsedMime?.replyTo || replyToHeader || null;

  const subject =
    parsedMime?.subject ||
    decodeRfc2047(sesPayload.mail?.commonHeaders?.subject || '') ||
    '(ไม่มีหัวข้อ)';

  const textBody = parsedMime?.textBody || (!parsedMime?.htmlBody ? '(ไม่มีข้อความ)' : '');
  const htmlBody = parsedMime?.htmlBody || null;
  const internetMessageId =
    parsedMime?.messageId || sesPayload.mail?.commonHeaders?.messageId || null;
  const sesMessageId = sesPayload.mail?.messageId || null;
  const receivedAtRaw = sesPayload.mail?.timestamp || sesPayload.receipt?.timestamp;
  const receivedAt = receivedAtRaw && !Number.isNaN(new Date(receivedAtRaw).getTime())
    ? new Date(receivedAtRaw).toISOString()
    : new Date().toISOString();

  const uniqueRecipients = Array.from(
    new Set(
      candidateRecipients
        .map((c) => parseEmailAddress(c).address.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  const id = `inb-${randomUUID()}`;
  const insertRes = await pool.query(
    `INSERT INTO inbound_emails (
      id, "sesMessageId", "snsMessageId", "fromAddress", "fromName",
      "toAddress", "allRecipients", subject, "textBody", "htmlBody",
      "internetMessageId", "replyToAddress", "attachmentsMeta",
      "spamVerdict", "virusVerdict", status, "receivedAt"
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13,
      $14, $15, 'unread', $16::timestamptz
    )
    ON CONFLICT ("sesMessageId") DO NOTHING
    RETURNING id`,
    [
      id,
      sesMessageId,
      options?.snsMessageId ?? null,
      fromAddress,
      fromName,
      matchedRecipient,
      JSON.stringify(uniqueRecipients),
      subject,
      textBody,
      htmlBody,
      internetMessageId,
      replyToAddress,
      JSON.stringify(parsedMime?.attachments ?? []),
      sesPayload.receipt?.spamVerdict?.status ?? null,
      sesPayload.receipt?.virusVerdict?.status ?? null,
      receivedAt,
    ],
  );

  if (insertRes.rowCount === 0 && sesMessageId) {
    return { status: 'duplicate', sesMessageId };
  }

  return { status: 'stored', id, toAddress: matchedRecipient };
}

export async function ingestDirectInboundEmail(
  pool: Pool,
  input: {
    from: string;
    to: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    rawMime?: string;
    messageId?: string;
  },
): Promise<
  | { status: 'stored'; id: string; toAddress: string }
  | { status: 'duplicate'; sesMessageId: string }
  | { status: 'ignored'; reason: string }
> {
  const toList = Array.isArray(input.to) ? input.to : [input.to];
  if (input.rawMime) {
    return ingestSesInboundNotification(pool, {
      notificationType: 'Received',
      mail: {
        messageId: input.messageId || `direct-${randomUUID()}`,
        source: input.from,
        destination: toList,
      },
      receipt: {
        recipients: toList,
        spamVerdict: { status: 'PASS' },
        virusVerdict: { status: 'PASS' },
      },
      content: input.rawMime,
    });
  }

  await ensureInboundEmailSchema(pool);
  const matchedRecipient = resolveMatchedRecipient(toList, getAllowedInboundRecipients());
  if (!matchedRecipient) {
    return { status: 'ignored', reason: 'recipient_not_allowed' };
  }

  const parsedFrom = parseEmailAddress(input.from);
  const sesMessageId = input.messageId || `direct-${randomUUID()}`;
  const id = `inb-${randomUUID()}`;
  const res = await pool.query(
    `INSERT INTO inbound_emails (
      id, "sesMessageId", "fromAddress", "fromName",
      "toAddress", "allRecipients", subject, "textBody", "htmlBody",
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'unread')
    ON CONFLICT ("sesMessageId") DO NOTHING
    RETURNING id`,
    [
      id,
      sesMessageId,
      parsedFrom.address || input.from.trim().toLowerCase(),
      parsedFrom.name,
      matchedRecipient,
      JSON.stringify(toList.map((t) => parseEmailAddress(t).address.toLowerCase()).filter(Boolean)),
      (input.subject || '(ไม่มีหัวข้อ)').trim(),
      input.text || '',
      input.html || null,
    ],
  );
  if (res.rowCount === 0) return { status: 'duplicate', sesMessageId };
  return { status: 'stored', id, toAddress: matchedRecipient };
}

export async function listInboundEmails(
  pool: Pool,
  filters?: {
    status?: InboundEmailStatus | 'all';
    recipient?: string;
    q?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{
  emails: InboundEmailRecord[];
  counts: InboundEmailCounts;
  recipientCounts: Record<string, number>;
}> {
  await ensureInboundEmailSchema(pool);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status && filters.status !== 'all') {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters?.recipient && filters.recipient !== 'all') {
    params.push(filters.recipient.trim().toLowerCase());
    conditions.push(`"toAddress" = $${params.length}`);
  }
  if (filters?.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const p = `$${params.length}`;
    conditions.push(`(
      "fromAddress" ILIKE ${p} OR
      "fromName" ILIKE ${p} OR
      "toAddress" ILIKE ${p} OR
      subject ILIKE ${p} OR
      "textBody" ILIKE ${p}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 100);
  const offset = Math.max(filters?.offset ?? 0, 0);

  const listParams = [...params, limit, offset];
  const rowsRes = await pool.query(
    `SELECT * FROM inbound_emails
     ${whereClause}
     ORDER BY "receivedAt" DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  const countsRes = await pool.query<{ status: InboundEmailStatus; cnt: string }>(
    `SELECT status, COUNT(*)::text AS cnt FROM inbound_emails GROUP BY status`,
  );
  const counts: InboundEmailCounts = {
    all: 0,
    unread: 0,
    read: 0,
    replied: 0,
    archived: 0,
  };
  for (const r of countsRes.rows) {
    const n = Number.parseInt(r.cnt, 10) || 0;
    if (r.status in counts) {
      counts[r.status] = n;
    }
    counts.all += n;
  }

  const recipRes = await pool.query<{ toAddress: string; cnt: string }>(
    `SELECT "toAddress", COUNT(*)::text AS cnt FROM inbound_emails GROUP BY "toAddress"`,
  );
  const recipientCounts: Record<string, number> = {};
  for (const r of recipRes.rows) {
    recipientCounts[r.toAddress] = Number.parseInt(r.cnt, 10) || 0;
  }

  return {
    emails: rowsRes.rows.map((r) => mapInboundEmailRow(r as Record<string, unknown>)),
    counts,
    recipientCounts,
  };
}

export async function getInboundEmailDetail(
  pool: Pool,
  id: string,
): Promise<{ email: InboundEmailRecord; replies: InboundEmailReplyRecord[] } | null> {
  await ensureInboundEmailSchema(pool);
  const emailRes = await pool.query('SELECT * FROM inbound_emails WHERE id = $1', [id]);
  if (emailRes.rowCount === 0) return null;

  const repliesRes = await pool.query(
    'SELECT * FROM inbound_email_replies WHERE "inboundEmailId" = $1 ORDER BY "sentAt" ASC',
    [id],
  );

  return {
    email: mapInboundEmailRow(emailRes.rows[0] as Record<string, unknown>),
    replies: repliesRes.rows.map((r) => mapReplyRow(r as Record<string, unknown>)),
  };
}

export async function updateInboundEmailStatus(
  pool: Pool,
  id: string,
  status: InboundEmailStatus,
): Promise<InboundEmailRecord | null> {
  await ensureInboundEmailSchema(pool);
  const res = await pool.query(
    `UPDATE inbound_emails
     SET status = $2,
         "readAt" = CASE WHEN $2 IN ('read', 'replied') AND "readAt" IS NULL THEN now() ELSE "readAt" END,
         "updatedAt" = now()
     WHERE id = $1
     RETURNING *`,
    [id, status],
  );
  if (res.rowCount === 0) return null;
  return mapInboundEmailRow(res.rows[0] as Record<string, unknown>);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function replyToInboundEmail(
  pool: Pool,
  params: {
    inboundEmailId: string;
    bodyText: string;
    subject?: string;
    sentByUserId?: string | null;
    sentByEmail?: string | null;
    transport?: EmailTransport;
  },
): Promise<{ reply: InboundEmailReplyRecord; email: InboundEmailRecord }> {
  await ensureInboundEmailSchema(pool);

  const trimmedBody = params.bodyText.trim();
  if (!trimmedBody) {
    throw new Error('กรุณาระบุข้อความตอบกลับ');
  }
  if (trimmedBody.length > 20000) {
    throw new Error('ข้อความตอบกลับยาวเกินไป');
  }

  const existingRes = await pool.query('SELECT * FROM inbound_emails WHERE id = $1', [
    params.inboundEmailId,
  ]);
  if (existingRes.rowCount === 0) {
    throw new Error('ไม่พบข้อความอีเมลที่ต้องการตอบกลับ');
  }
  const inbound = mapInboundEmailRow(existingRes.rows[0] as Record<string, unknown>);

  const targetTo = inbound.replyToAddress || inbound.fromAddress;
  const replySubject =
    params.subject?.trim() ||
    (inbound.subject.toLowerCase().startsWith('re:')
      ? inbound.subject
      : `Re: ${inbound.subject || 'ติดต่อทีมงาน TICKET'}`);

  const mailboxFrom = `TICKET <${inbound.toAddress}>`;
  const useMailboxFrom = process.env.SES_REPLY_USE_MAILBOX_FROM === 'true';

  const headers: Array<{ name: string; value: string }> = [];
  if (inbound.internetMessageId) {
    headers.push({ name: 'In-Reply-To', value: inbound.internetMessageId });
    headers.push({ name: 'References', value: inbound.internetMessageId });
  }

  const quotedOriginal = inbound.textBody
    ? `\n\n--- ข้อความเดิมจาก ${inbound.fromAddress} ---\n${inbound.textBody.slice(0, 2000)}`
    : '';
  const fullText = `${trimmedBody}${quotedOriginal}`;
  const html = `
    <div style="font-family: sans-serif; line-height: 1.6; color: #0f172a;">
      <p style="white-space: pre-wrap;">${escapeHtml(trimmedBody)}</p>
      ${
        inbound.textBody
          ? `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
             <p style="font-size: 12px; color: #64748b; margin-bottom: 4px;">ข้อความเดิมจาก ${escapeHtml(inbound.fromAddress)}:</p>
             <blockquote style="margin: 0; padding-left: 12px; border-left: 3px solid #cbd5e1; color: #475569; white-space: pre-wrap;">${escapeHtml(inbound.textBody.slice(0, 2000))}</blockquote>`
          : ''
      }
    </div>
  `;

  const transport = params.transport ?? emailTransport;
  const sendResult = await transport.send({
    from: mailboxFrom,
    to: targetTo,
    subject: replySubject,
    text: fullText,
    html,
    replyTo: inbound.toAddress,
    preferMessageFrom: useMailboxFrom,
    headers: headers.length > 0 ? headers : undefined,
  });

  const replyId = `rep-${randomUUID()}`;
  const effectiveFrom =
    (!useMailboxFrom && process.env.EMAIL_FROM?.trim()) || mailboxFrom;

  const insertReplyRes = await pool.query(
    `INSERT INTO inbound_email_replies (
      id, "inboundEmailId", "fromAddress", "toAddress", subject, "bodyText",
      "sesMessageId", "sentByUserId", "sentByEmail"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      replyId,
      inbound.id,
      effectiveFrom,
      targetTo,
      replySubject,
      trimmedBody,
      sendResult.id,
      params.sentByUserId ?? null,
      params.sentByEmail ?? null,
    ],
  );

  const updatedEmailRes = await pool.query(
    `UPDATE inbound_emails
     SET status = 'replied',
         "repliedAt" = now(),
         "readAt" = COALESCE("readAt", now()),
         "updatedAt" = now()
     WHERE id = $1
     RETURNING *`,
    [inbound.id],
  );

  return {
    reply: mapReplyRow(insertReplyRes.rows[0] as Record<string, unknown>),
    email: mapInboundEmailRow(updatedEmailRes.rows[0] as Record<string, unknown>),
  };
}
