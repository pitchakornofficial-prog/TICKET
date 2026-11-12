import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCapturedEmails,
  createSesTransport,
  getCapturedEmails,
  setCustomEmailTransport,
} from '../../src/server/email';

describe('Amazon SES Email Delivery Contract (TASK-045, AC-126, AC-127, AC-128)', () => {
  beforeEach(() => {
    clearCapturedEmails();
    setCustomEmailTransport(null);
  });

  afterEach(() => {
    setCustomEmailTransport(null);
    clearCapturedEmails();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('AC-126: SES Simple Email Payload for All Email Types', () => {
    it('sends guest OTP email via SES format with correct recipient, subject, and text (re-verify AC-57/58)', async () => {
      vi.stubEnv('EMAIL_FROM', 'TICKET <tickets@ticket.phatysd.me>');
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ MessageId: 'ses-otp-001' })),
      );
      vi.stubGlobal('fetch', fetchMock);

      const transport = createSesTransport({
        accessKeyId: 'AKIA_SES_TEST',
        secretAccessKey: 'secret_ses_key',
        region: 'ap-southeast-1',
      });

      const otp = '849201';
      const recipient = 'buyer@test.example';
      const sendResult = await transport.send({
        from: 'noreply@ticket.invalid',
        to: recipient,
        subject: 'รหัส OTP สำหรับเข้าสู่ระบบ TICKET',
        text: `รหัส OTP ของคุณคือ ${otp} (หมดอายุใน 5 นาที)`,
      });

      // Provider acceptance returns MessageId, not inbox delivery proof
      expect(sendResult.id).toBe('ses-otp-001');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://email.ap-southeast-1.amazonaws.com/v2/email/outbound-emails');
      const payload = JSON.parse(init.body);
      expect(payload.FromEmailAddress).toBe('TICKET <tickets@ticket.phatysd.me>');
      expect(payload.Destination.ToAddresses).toEqual([recipient]);
      expect(payload.Content.Simple.Subject.Data).toBe('รหัส OTP สำหรับเข้าสู่ระบบ TICKET');
      expect(payload.Content.Simple.Body.Text.Data).toContain(otp);
    });

    it('sends ticket issuance and order link email via SES with HTML and Text (re-verify AC-20)', async () => {
      vi.stubEnv('EMAIL_FROM', 'TICKET <tickets@ticket.phatysd.me>');
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ MessageId: 'ses-ticket-002' })),
      );
      vi.stubGlobal('fetch', fetchMock);

      const transport = createSesTransport({
        accessKeyId: 'AKIA_SES_TEST',
        secretAccessKey: 'secret_ses_key',
        region: 'ap-southeast-1',
      });

      const orderId = 'ord-ses-test-789';
      const recipient = 'concertgoer@example.com';
      const ticketCode = 'TCK-2026-VIP-001';
      const orderLink = `https://ticket.phatysd.me/orders/${orderId}/success?tab=tickets`;

      const sendResult = await transport.send({
        from: 'noreply@ticket.invalid',
        to: recipient,
        subject: `ตั๋วคอนเสิร์ตและลิงก์คำสั่งซื้อ ${orderId}`,
        text: `ขอบคุณสำหรับการสั่งซื้อ บัตรของคุณ: ${ticketCode} ดูรายละเอียด: ${orderLink}`,
        html: `<div><h1>ตั๋วคอนเสิร์ต</h1><p>รหัสบัตร: ${ticketCode}</p><a href="${orderLink}">เปิดดูคำสั่งซื้อ</a></div>`,
      });

      expect(sendResult.id).toBe('ses-ticket-002');
      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload.Destination.ToAddresses).toEqual([recipient]);
      expect(payload.Content.Simple.Body.Text.Data).toContain(ticketCode);
      expect(payload.Content.Simple.Body.Text.Data).toContain(orderLink);
      expect(payload.Content.Simple.Body.Html.Data).toContain(ticketCode);
      expect(payload.Content.Simple.Body.Html.Data).toContain(orderLink);
    });

    it('sends organizer invitation email via SES with invite token (re-verify AC-52)', async () => {
      vi.stubEnv('EMAIL_FROM', 'TICKET <tickets@ticket.phatysd.me>');
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ MessageId: 'ses-invite-003' })),
      );
      vi.stubGlobal('fetch', fetchMock);

      const transport = createSesTransport({
        accessKeyId: 'AKIA_SES_TEST',
        secretAccessKey: 'secret_ses_key',
        region: 'ap-southeast-1',
      });

      const recipient = 'organizer.partner@promoter.co.th';
      const inviteUrl = 'https://ticket.phatysd.me/back-office/accept-invite?token=inv_test_secret_token';

      await transport.send({
        from: 'noreply@ticket.invalid',
        to: recipient,
        subject: 'คำเชิญเข้าร่วมระบบ TICKET สำหรับผู้จัดงาน',
        text: `คุณได้รับคำเชิญเข้าร่วมระบบ: ${inviteUrl}`,
        html: `<p>คลิกเพื่อยอมรับคำเชิญ: <a href="${inviteUrl}">ยอมรับคำเชิญ</a></p>`,
      });

      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload.Destination.ToAddresses).toEqual([recipient]);
      expect(payload.Content.Simple.Subject.Data).toBe('คำเชิญเข้าร่วมระบบ TICKET สำหรับผู้จัดงาน');
      expect(payload.Content.Simple.Body.Text.Data).toContain(inviteUrl);
    });

    it('sends password reset link email via SES (re-verify AC-55)', async () => {
      vi.stubEnv('EMAIL_FROM', 'TICKET <tickets@ticket.phatysd.me>');
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ MessageId: 'ses-reset-004' })),
      );
      vi.stubGlobal('fetch', fetchMock);

      const transport = createSesTransport({
        accessKeyId: 'AKIA_SES_TEST',
        secretAccessKey: 'secret_ses_key',
        region: 'ap-southeast-1',
      });

      const recipient = 'owner@ticket.local';
      const resetUrl = 'https://ticket.phatysd.me/back-office/reset-password?token=rst_test_token';

      await transport.send({
        from: 'noreply@ticket.invalid',
        to: recipient,
        subject: 'รีเซ็ตรหัสผ่านบัญชี TICKET',
        text: `ลิงก์รีเซ็ตรหัสผ่าน: ${resetUrl} (หมดอายุใน 30 นาที)`,
      });

      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload.Destination.ToAddresses).toEqual([recipient]);
      expect(payload.Content.Simple.Subject.Data).toBe('รีเซ็ตรหัสผ่านบัญชี TICKET');
      expect(payload.Content.Simple.Body.Text.Data).toContain(resetUrl);
    });
  });

  describe('AC-127: Failure Isolation, Recovery, and Local/Production Isolation', () => {
    it('throws when SES rejects send, preserving recovery without claim of inbox delivery', async () => {
      vi.stubEnv('EMAIL_FROM', 'TICKET <tickets@ticket.phatysd.me>');
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            __type: 'AccountSuspendedException',
            message: 'Sending quota exceeded or account under review.',
          }),
          { status: 400 },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const transport = createSesTransport({
        accessKeyId: 'AKIA_SES_TEST',
        secretAccessKey: 'secret_ses_key',
        region: 'ap-southeast-1',
      });

      await expect(
        transport.send({
          from: 'noreply@ticket.invalid',
          to: 'customer@company.com',
          subject: 'ตั๋วของคุณ',
          text: 'เนื้อหาตั๋ว',
        }),
      ).rejects.toThrow(/SES email delivery failed: 400/);
    });

    it('strictly forbids local capture in production when credentials are missing (AC-127 fail-closed)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SES_ACCESS_KEY_ID', '');
      vi.stubEnv('SES_SECRET_ACCESS_KEY', '');
      vi.stubEnv('AWS_ACCESS_KEY_ID', '');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', '');

      const transport = createSesTransport();

      await expect(
        transport.send({
          from: 'noreply@ticket.invalid',
          to: 'customer@company.com',
          subject: 'รหัส OTP',
          text: '123456',
        }),
      ).rejects.toThrow(/SES credentials.*required in production/);

      // Captured emails array must remain strictly empty in production failure
      expect(getCapturedEmails()).toHaveLength(0);
    });

    it('captures emails locally in non-production mode without making remote calls', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('SES_ACCESS_KEY_ID', '');
      vi.stubEnv('SES_SECRET_ACCESS_KEY', '');

      const transport = createSesTransport();
      const sendRes = await transport.send({
        from: 'noreply@ticket.invalid',
        to: 'buyer@test.local',
        subject: 'Local Capture Test',
        text: 'This is a local capture test message',
      });

      expect(sendRes.id).toMatch(/^local-msg-/);
      const captured = getCapturedEmails();
      expect(captured).toHaveLength(1);
      expect(captured[0].to).toBe('buyer@test.local');
      expect(captured[0].text).toContain('local capture test message');
    });
  });

  describe('AC-128: SES Production Readiness Checklist Verification', () => {
    it('verifies production configuration requires verified sending identity and AWS credentials', () => {
      const { productionConfigErrors } = require('../../scripts/check-production-env.mjs');
      const baseEnv = {
        DATABASE_URL: 'postgresql://user:password@database.internal/ticket',
        BETTER_AUTH_URL: 'https://ticket.phatysd.me',
        BETTER_AUTH_SECRET: 'x'.repeat(48),
        EMAIL_FROM: 'TICKET <tickets@ticket.phatysd.me>',
        SES_ACCESS_KEY_ID: 'AKIA_PRODUCTION_KEY',
        SES_SECRET_ACCESS_KEY: 's'.repeat(40),
        SES_REGION: 'ap-southeast-1',
        STRIPE_SECRET_KEY: 'sk_live_key',
        STRIPE_PUBLISHABLE_KEY: 'pk_live_key',
        STRIPE_WEBHOOK_SECRET: 'whsec_prod_secret',
        R2_ACCESS_KEY_ID: 'r2_key',
        R2_SECRET_ACCESS_KEY: 'r2_secret',
        R2_BUCKET: 'ticket-assets',
        R2_ACCOUNT_ID: 'cf_account',
      };

      expect(productionConfigErrors(baseEnv)).toEqual([]);

      // Invalid unverified/local email domain must be rejected
      const invalidEmail = productionConfigErrors({
        ...baseEnv,
        EMAIL_FROM: 'noreply@ticket.invalid',
      });
      expect(invalidEmail.join('\n')).toContain('EMAIL_FROM must use a verified public email domain');

      // Missing SES region with invalid format must be caught
      const invalidRegion = productionConfigErrors({
        ...baseEnv,
        SES_REGION: 'invalid_region_name',
      });
      expect(invalidRegion.join('\n')).toContain('valid AWS region identifier');
    });
  });
});
