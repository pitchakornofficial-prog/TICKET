import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCapturedEmails,
  getCapturedEmails,
  setCustomEmailTransport,
} from '../../src/server/email';
import {
  buildSnsCanonicalSigningString,
  ingestSesInboundNotification,
  isValidSnsUrl,
  replyToInboundEmail,
  verifySnsMessageSignature,
  verifyWebhookSecret,
} from '../../src/server/inbound-email';
import {
  decodeRfc2047,
  parseEmailAddress,
  parseRawMimeEmail,
} from '../../src/server/mime-parser';

let mockRole: 'owner' | 'organizer' | 'scanner' | null = 'owner';

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => {
        if (!mockRole) return null;
        return {
          session: { id: 'sess-inb', userId: 'usr-1', expiresAt: new Date(Date.now() + 3600_000) },
          user: {
            id: 'usr-1',
            name: 'Owner Test',
            email: 'owner@ticket.invalid',
            role: mockRole,
          },
        };
      },
    },
  }),
}));

// Lightweight in-memory Pool fake for route handler and service unit tests
function createMockInboundPool() {
  const emails = new Map<string, Record<string, unknown>>();
  const replies: Array<Record<string, unknown>> = [];

  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return { rowCount: 0, rows: [] };
      }

      if (sql.includes('INSERT INTO inbound_emails')) {
        const sesMessageId = params[1] as string | null;
        if (sesMessageId) {
          for (const row of emails.values()) {
            if (row.sesMessageId === sesMessageId) {
              return { rowCount: 0, rows: [] };
            }
          }
        }
        const id = params[0] as string;
        const now = new Date().toISOString();
        const record: Record<string, unknown> = {
          id,
          sesMessageId,
          snsMessageId: params[2],
          fromAddress: params[3],
          fromName: params[4],
          toAddress: params[5],
          allRecipients: params[6],
          subject: params[7],
          textBody: params[8],
          htmlBody: params[9],
          internetMessageId: params[10],
          replyToAddress: params[11],
          attachmentsMeta: params[12],
          spamVerdict: params[13],
          virusVerdict: params[14],
          status: 'unread',
          receivedAt: params[15] || now,
          readAt: null,
          repliedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        emails.set(id, record);
        return { rowCount: 1, rows: [{ id }] };
      }

      if (sql.includes('SELECT * FROM inbound_emails WHERE id = $1')) {
        const row = emails.get(params[0] as string);
        return row ? { rowCount: 1, rows: [row] } : { rowCount: 0, rows: [] };
      }

      if (sql.includes('SELECT * FROM inbound_email_replies WHERE "inboundEmailId" = $1')) {
        const matched = replies.filter((r) => r.inboundEmailId === params[0]);
        return { rowCount: matched.length, rows: matched };
      }

      if (sql.includes('UPDATE inbound_emails') && sql.includes('SET status = $2')) {
        const id = params[0] as string;
        const nextStatus = params[1] as string;
        const row = emails.get(id);
        if (!row) return { rowCount: 0, rows: [] };
        row.status = nextStatus;
        if ((nextStatus === 'read' || nextStatus === 'replied') && !row.readAt) {
          row.readAt = new Date().toISOString();
        }
        row.updatedAt = new Date().toISOString();
        return { rowCount: 1, rows: [row] };
      }

      if (sql.includes('INSERT INTO inbound_email_replies')) {
        const now = new Date().toISOString();
        const rep = {
          id: params[0],
          inboundEmailId: params[1],
          fromAddress: params[2],
          toAddress: params[3],
          subject: params[4],
          bodyText: params[5],
          sesMessageId: params[6],
          sentByUserId: params[7],
          sentByEmail: params[8],
          sentAt: now,
        };
        replies.push(rep);
        return { rowCount: 1, rows: [rep] };
      }

      if (sql.includes('UPDATE inbound_emails') && sql.includes("SET status = 'replied'")) {
        const id = params[0] as string;
        const row = emails.get(id);
        if (!row) return { rowCount: 0, rows: [] };
        const now = new Date().toISOString();
        row.status = 'replied';
        row.repliedAt = now;
        row.readAt = row.readAt || now;
        row.updatedAt = now;
        return { rowCount: 1, rows: [row] };
      }

      if (sql.includes('GROUP BY status')) {
        const counts = new Map<string, number>();
        for (const row of emails.values()) {
          const st = String(row.status);
          counts.set(st, (counts.get(st) ?? 0) + 1);
        }
        return {
          rowCount: counts.size,
          rows: Array.from(counts.entries()).map(([status, cnt]) => ({ status, cnt: String(cnt) })),
        };
      }

      if (sql.includes('GROUP BY "toAddress"')) {
        const counts = new Map<string, number>();
        for (const row of emails.values()) {
          const to = String(row.toAddress);
          counts.set(to, (counts.get(to) ?? 0) + 1);
        }
        return {
          rowCount: counts.size,
          rows: Array.from(counts.entries()).map(([toAddress, cnt]) => ({ toAddress, cnt: String(cnt) })),
        };
      }

      if (sql.includes('SELECT * FROM inbound_emails')) {
        const rows = Array.from(emails.values());
        return { rowCount: rows.length, rows };
      }

      return { rowCount: 0, rows: [] };
    },
  } as unknown as Pool;

  return { pool, emails, replies };
}

let activeMockPool: Pool;
vi.mock('@/server/database', () => ({
  getDatabasePool: () => activeMockPool,
}));

describe('SES Inbound Mailbox (MIME parser, SNS security, webhook, owner API & UI)', () => {
  beforeEach(() => {
    clearCapturedEmails();
    setCustomEmailTransport(null);
    mockRole = 'owner';
    activeMockPool = createMockInboundPool().pool;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearCapturedEmails();
  });

  describe('MIME parser & RFC 2047 decoding', () => {
    it('decodes Thai UTF-8 RFC 2047 subjects and sender display names', () => {
      const encodedSubject = `=?UTF-8?B?${Buffer.from('สอบถามเรื่องตั๋วคอนเสิร์ต', 'utf8').toString('base64')}?=`;
      expect(decodeRfc2047(encodedSubject)).toBe('สอบถามเรื่องตั๋วคอนเสิร์ต');

      const addr = parseEmailAddress(
        `=?UTF-8?B?${Buffer.from('สมชาย ใจดี', 'utf8').toString('base64')}?= <somchai@example.com>`,
      );
      expect(addr).toEqual({ name: 'สมชาย ใจดี', address: 'somchai@example.com' });
    });

    it('parses multipart/mixed + multipart/alternative MIME with Thai base64 text, HTML, and attachments', () => {
      const thaiText = 'สวัสดีทีมงาน ต้องการตรวจสอบคำสั่งซื้อ #ORD-001 ครับ';
      const thaiHtml = '<p>สวัสดีทีมงาน <strong>ต้องการตรวจสอบคำสั่งซื้อ #ORD-001</strong> ครับ</p>';
      const rawMime = [
        'From: "Customer" <buyer@example.com>',
        'To: support@phatysd.me',
        'Reply-To: buyer-reply@example.com',
        'Subject: Order help',
        'Message-ID: <msg-123@example.com>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="mix-bnd"',
        '',
        '--mix-bnd',
        'Content-Type: multipart/alternative; boundary="alt-bnd"',
        '',
        '--alt-bnd',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(thaiText, 'utf8').toString('base64'),
        '--alt-bnd',
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        thaiHtml,
        '--alt-bnd--',
        '--mix-bnd',
        'Content-Type: application/pdf; name="slip.pdf"',
        'Content-Disposition: attachment; filename="slip.pdf"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from('PDFDATA', 'utf8').toString('base64'),
        '--mix-bnd--',
      ].join('\r\n');

      const parsed = parseRawMimeEmail(rawMime);
      expect(parsed.from.address).toBe('buyer@example.com');
      expect(parsed.to.map((t) => t.address)).toEqual(['support@phatysd.me']);
      expect(parsed.replyTo).toBe('buyer-reply@example.com');
      expect(parsed.messageId).toBe('<msg-123@example.com>');
      expect(parsed.textBody).toBe(thaiText);
      expect(parsed.htmlBody).toBe(thaiHtml);
      expect(parsed.attachments).toEqual([
        { filename: 'slip.pdf', contentType: 'application/pdf', size: 7 },
      ]);
    });
  });

  describe('SNS SSRF & signature security helpers', () => {
    it('accepts only official HTTPS AWS SNS endpoints and rejects SSRF URLs', () => {
      expect(
        isValidSnsUrl(
          'https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-1234.pem',
          { requirePem: true },
        ),
      ).toBe(true);
      expect(
        isValidSnsUrl('http://sns.ap-southeast-1.amazonaws.com/cert.pem', { requirePem: true }),
      ).toBe(false);
      expect(
        isValidSnsUrl('https://evil.example.com/SimpleNotificationService.pem', {
          requirePem: true,
        }),
      ).toBe(false);
      expect(
        isValidSnsUrl('https://169.254.169.254/latest/meta-data/', { requirePem: true }),
      ).toBe(false);
    });

    it('builds canonical signing string for Notification and SubscriptionConfirmation', () => {
      const str = buildSnsCanonicalSigningString({
        Type: 'Notification',
        MessageId: 'm-1',
        TopicArn: 'arn:aws:sns:ap-southeast-1:123456789012:ticket-inbound',
        Subject: 'Amazon SES Email Receipt Notification',
        Message: '{"notificationType":"Received"}',
        Timestamp: '2026-11-17T02:00:00.000Z',
      });
      expect(str).toContain('Message\n{"notificationType":"Received"}\n');
      expect(str).toContain('MessageId\nm-1\n');
      expect(str).toContain('Type\nNotification\n');
    });

    it('rejects invalid SNS signatures', async () => {
      const valid = await verifySnsMessageSignature({
        Type: 'Notification',
        MessageId: 'm-1',
        TopicArn: 'arn:aws:sns:ap-southeast-1:123:topic',
        Message: '{}',
        Timestamp: '2026-11-17T02:00:00.000Z',
        SignatureVersion: '2',
        Signature: 'invalid-base64',
        SigningCertURL: 'https://evil.example.com/cert.pem',
      });
      expect(valid).toBe(false);
    });

    it('verifies webhook secret in constant time', () => {
      expect(verifyWebhookSecret('my-secret-123', 'my-secret-123')).toBe(true);
      expect(verifyWebhookSecret('my-secret-124', 'my-secret-123')).toBe(false);
      expect(verifyWebhookSecret('', 'my-secret-123')).toBe(false);
    });
  });

  describe('Ingestion & Reply service', () => {
    it('ingests allowed recipients idempotently and ignores non-allowed recipients', async () => {
      const { pool } = createMockInboundPool();

      const allowedRes = await ingestSesInboundNotification(pool, {
        notificationType: 'Received',
        mail: {
          messageId: 'ses-inb-001',
          source: 'guest@example.com',
          destination: ['support@phatysd.me'],
          commonHeaders: {
            from: ['Guest User <guest@example.com>'],
            to: ['support@phatysd.me'],
            subject: 'ช่วยตรวจสอบบัตรให้หน่อยครับ',
            messageId: '<guest-msg-1@example.com>',
          },
        },
        receipt: {
          recipients: ['support@phatysd.me'],
          spamVerdict: { status: 'PASS' },
          virusVerdict: { status: 'PASS' },
        },
        content: [
          'From: Guest User <guest@example.com>',
          'To: support@phatysd.me',
          'Subject: ช่วยตรวจสอบบัตรให้หน่อยครับ',
          'Content-Type: text/plain; charset=UTF-8',
          '',
          'ยังไม่ได้รับอีเมลบัตรเลยครับ',
        ].join('\r\n'),
      });
      expect(allowedRes).toMatchObject({ status: 'stored', toAddress: 'support@phatysd.me' });

      const dupRes = await ingestSesInboundNotification(pool, {
        notificationType: 'Received',
        mail: { messageId: 'ses-inb-001', destination: ['support@phatysd.me'] },
        receipt: { recipients: ['support@phatysd.me'] },
      });
      expect(dupRes).toEqual({ status: 'duplicate', sesMessageId: 'ses-inb-001' });

      const ignoredRes = await ingestSesInboundNotification(pool, {
        notificationType: 'Received',
        mail: { messageId: 'ses-inb-002', destination: ['random@phatysd.me'] },
        receipt: { recipients: ['random@phatysd.me'] },
      });
      expect(ignoredRes).toEqual({ status: 'ignored', reason: 'recipient_not_allowed' });
    });

    it('replies to an inbound email via SES transport with In-Reply-To and updates status', async () => {
      const { pool } = createMockInboundPool();
      const stored = await ingestSesInboundNotification(pool, {
        notificationType: 'Received',
        mail: {
          messageId: 'ses-inb-reply-1',
          source: 'promoter@example.com',
          destination: ['organizer@phatysd.me'],
        },
        receipt: { recipients: ['organizer@phatysd.me'] },
        content: [
          'From: Promoter <promoter@example.com>',
          'To: organizer@phatysd.me',
          'Message-ID: <promoter-msg-99@example.com>',
          'Subject: ขอเชิญเป็นผู้จัดงาน',
          'Content-Type: text/plain; charset=UTF-8',
          '',
          'ส่งรายละเอียดคอนเสิร์ตมาให้พิจารณาครับ',
        ].join('\r\n'),
      });
      expect(stored.status).toBe('stored');
      if (stored.status !== 'stored') throw new Error('expected stored');

      const result = await replyToInboundEmail(pool, {
        inboundEmailId: stored.id,
        bodyText: 'ทีมงานได้รับรายละเอียดแล้ว กำลังตรวจสอบและจะส่งคำเชิญให้ครับ',
        sentByUserId: 'usr-owner',
        sentByEmail: 'owner@ticket.invalid',
      });

      expect(result.email.status).toBe('replied');
      expect(result.reply.toAddress).toBe('promoter@example.com');
      expect(result.reply.subject).toBe('Re: ขอเชิญเป็นผู้จัดงาน');

      const sent = getCapturedEmails();
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('promoter@example.com');
      expect(sent[0].replyTo).toBe('organizer@phatysd.me');
      expect(sent[0].headers).toEqual([
        { name: 'In-Reply-To', value: '<promoter-msg-99@example.com>' },
        { name: 'References', value: '<promoter-msg-99@example.com>' },
      ]);
    });
  });

  describe('Webhook & Owner HTTP routes', () => {
    it('rejects unauthenticated webhook calls and accepts secret-verified inbound emails', async () => {
      const { POST: postWebhook } = await import(
        '../../src/app/api/webhooks/ses-inbound/route'
      );

      const unauthReq = new Request('http://127.0.0.1:3000/api/webhooks/ses-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'sender@example.com',
          to: 'support@phatysd.me',
          subject: 'Test',
          text: 'Hello',
        }),
      });
      const unauthRes = await postWebhook(unauthReq);
      expect(unauthRes.status).toBe(401);

      vi.stubEnv('SES_INBOUND_WEBHOOK_SECRET', 'inbound-secret-xyz');
      const badSecretReq = new Request('http://127.0.0.1:3000/api/webhooks/ses-inbound', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-inbound-secret': 'wrong-secret',
        },
        body: JSON.stringify({ from: 'sender@example.com', to: 'support@phatysd.me' }),
      });
      expect((await postWebhook(badSecretReq)).status).toBe(401);

      const okReq = new Request('http://127.0.0.1:3000/api/webhooks/ses-inbound', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-inbound-secret': 'inbound-secret-xyz',
        },
        body: JSON.stringify({
          from: 'Buyer <buyer@example.com>',
          to: 'organizer-support@phatysd.me',
          subject: 'ขอแก้ไขบัญชีรับเงิน',
          text: 'ส่งเอกสารเพิ่มเติมครับ',
        }),
      });
      const okRes = await postWebhook(okReq);
      expect(okRes.status).toBe(200);
      const okJson = (await okRes.json()) as { status: string; toAddress: string };
      expect(okJson.status).toBe('stored');
      expect(okJson.toAddress).toBe('organizer-support@phatysd.me');
    });

    it('restricts owner inbound-emails routes strictly to owner role and allows owner reply', async () => {
      const { GET: listEmails } = await import(
        '../../src/app/api/owner/inbound-emails/route'
      );
      const { POST: postReply } = await import(
        '../../src/app/api/owner/inbound-emails/[id]/reply/route'
      );
      const { POST: postWebhook } = await import(
        '../../src/app/api/webhooks/ses-inbound/route'
      );

      vi.stubEnv('SES_INBOUND_WEBHOOK_SECRET', 'inbound-secret-xyz');
      const ingestRes = await postWebhook(
        new Request('http://127.0.0.1:3000/api/webhooks/ses-inbound', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-inbound-secret': 'inbound-secret-xyz',
          },
          body: JSON.stringify({
            from: 'user@example.com',
            to: 'support@phatysd.me',
            subject: 'สอบถามการคืนเงิน',
            text: 'ต้องทำอย่างไรคะ',
          }),
        }),
      );
      const { id } = (await ingestRes.json()) as { id: string };

      mockRole = 'organizer';
      const forbiddenRes = await listEmails(
        new Request('http://127.0.0.1:3000/api/owner/inbound-emails'),
      );
      expect(forbiddenRes.status).toBe(403);

      mockRole = 'owner';
      const listRes = await listEmails(
        new Request('http://127.0.0.1:3000/api/owner/inbound-emails'),
      );
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as {
        emails: Array<{ id: string; subject: string }>;
        counts: { all: number; unread: number };
      };
      expect(listData.emails).toHaveLength(1);
      expect(listData.counts.unread).toBe(1);

      const replyRes = await postReply(
        new Request(`http://127.0.0.1:3000/api/owner/inbound-emails/${id}/reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            origin: 'http://127.0.0.1:3000',
          },
          body: JSON.stringify({ bodyText: 'สามารถยื่นคำขอคืนเงินได้ที่หน้าคำสั่งซื้อครับ' }),
        }),
        { params: Promise.resolve({ id }) },
      );
      expect(replyRes.status).toBe(200);
      expect(getCapturedEmails()).toHaveLength(1);
    });

    it('rejects oversized streamed webhook payloads over 10 MiB without Content-Length using 413', async () => {
      const { POST: postWebhook } = await import(
        '../../src/app/api/webhooks/ses-inbound/route'
      );

      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(6 * 1024 * 1024));
          controller.enqueue(new Uint8Array(5 * 1024 * 1024));
        },
        cancel,
      });

      const req = new Request('http://127.0.0.1:3000/api/webhooks/ses-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' });

      expect(req.headers.has('content-length')).toBe(false);
      const res = await postWebhook(req);
      expect(res.status).toBe(413);
      expect(cancel).toHaveBeenCalledOnce();
    });

    it('blocks SNS confused deputy in production when neither TopicArn nor secret is configured, and rejects mismatched TopicArn', async () => {
      const { POST: postWebhook } = await import(
        '../../src/app/api/webhooks/ses-inbound/route'
      );

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SES_INBOUND_SNS_TOPIC_ARN', '');
      vi.stubEnv('SES_INBOUND_WEBHOOK_SECRET', '');

      const snsEnvelope = {
        Type: 'Notification',
        MessageId: 'sns-msg-attacker-1',
        TopicArn: 'arn:aws:sns:ap-southeast-1:999999999999:attacker-topic',
        Message: JSON.stringify({ notificationType: 'Received' }),
        Timestamp: '2026-11-17T03:00:00.000Z',
        SignatureVersion: '1',
        Signature: 'invalid-signature',
        SigningCertURL: 'https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-test.pem',
      };

      const unconfiguredRes = await postWebhook(
        new Request('http://127.0.0.1:3000/api/webhooks/ses-inbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snsEnvelope),
        }),
      );
      expect(unconfiguredRes.status).toBe(503);
      expect(fetchSpy).not.toHaveBeenCalled();

      vi.stubEnv(
        'SES_INBOUND_SNS_TOPIC_ARN',
        'arn:aws:sns:ap-southeast-1:123456789012:ticket-inbound-prod',
      );
      const mismatchRes = await postWebhook(
        new Request('http://127.0.0.1:3000/api/webhooks/ses-inbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snsEnvelope),
        }),
      );
      expect(mismatchRes.status).toBe(403);
      expect((await mismatchRes.json()) as { error: string }).toEqual({
        error: 'SNS TopicArn mismatch',
      });
      expect(fetchSpy).not.toHaveBeenCalled();

      vi.stubEnv('SES_INBOUND_SNS_TOPIC_ARN', '');
      vi.stubEnv('SES_INBOUND_WEBHOOK_SECRET', 'prod-inbound-secret');
      const secretVerifiedRes = await postWebhook(
        new Request('http://127.0.0.1:3000/api/webhooks/ses-inbound', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-inbound-secret': 'prod-inbound-secret',
          },
          body: JSON.stringify({
            ...snsEnvelope,
            SigningCertURL: 'https://evil.example.com/cert.pem',
          }),
        }),
      );
      expect(secretVerifiedRes.status).toBe(403);
      expect((await secretVerifiedRes.json()) as { error: string }).toEqual({
        error: 'Invalid SNS message signature',
      });
    });
  });

  describe('OwnerInboundMailbox UI compliance', () => {
    it('uses flat-canvas hub classes, sandboxed HTML preview iframe, and zero emojis', () => {
      const rootDir = process.cwd();
      const uiSrc = readFileSync(
        join(rootDir, 'src/components/owner-inbound-mailbox.tsx'),
        'utf8',
      );
      const workspaceSrc = readFileSync(
        join(rootDir, 'src/components/owner-workspace-view.tsx'),
        'utf8',
      );

      expect(uiSrc).toContain('owner-inbound-mailbox-hub');
      expect(uiSrc).toContain('sandbox=""');
      expect(uiSrc).toContain('referrerPolicy="no-referrer"');
      expect(uiSrc).toContain('support@phatysd.me');
      expect(uiSrc).toContain('organizer@phatysd.me');
      expect(uiSrc).toContain('organizer-support@phatysd.me');
      expect(uiSrc).not.toMatch(/\p{Extended_Pictographic}/u);

      expect(workspaceSrc).toContain('OwnerInboundMailbox');
      expect(workspaceSrc).toContain("id: 'inbox'");
    });
  });
});
