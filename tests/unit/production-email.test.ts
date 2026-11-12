import { afterEach, expect, it, vi } from 'vitest';
import {
  clearCapturedEmails,
  createResendTransport,
  createSesTransport,
  getCapturedEmails,
  setCustomEmailTransport,
} from '../../src/server/email';

afterEach(() => {
  setCustomEmailTransport(null);
  clearCapturedEmails();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('refuses local capture when production has no SES credentials (AC-127)', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  await expect(
    createSesTransport('').send({
      from: 'noreply@ticket.invalid',
      to: 'test@company.com',
      subject: 'OTP',
      text: 'fixture',
    }),
  ).rejects.toThrow('SES credentials');
});

it('uses the configured verified sender for every SES message (AC-126)', async () => {
  vi.stubEnv('EMAIL_FROM', 'TICKET <tickets@company.com>');
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ MessageId: 'ses-msg-fixture-123' })));
  vi.stubGlobal('fetch', fetchMock);

  const transport = createSesTransport({
    accessKeyId: 'AKIA_FIXTURE_KEY',
    secretAccessKey: 'secret_fixture_key',
    region: 'ap-southeast-1',
  });

  const result = await transport.send({
    from: 'noreply@ticket.invalid',
    to: 'test@company.com',
    subject: 'OTP',
    text: 'fixture text',
    html: '<p>fixture html</p>',
  });

  expect(result.id).toBe('ses-msg-fixture-123');
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const [url, requestInit] = fetchMock.mock.calls[0];
  expect(url).toBe('https://email.ap-southeast-1.amazonaws.com/v2/email/outbound-emails');
  expect(requestInit.method).toBe('POST');
  expect(requestInit.headers['content-type']).toBe('application/json');
  expect(requestInit.headers.Authorization).toContain('AWS4-HMAC-SHA256');
  expect(requestInit.headers.Authorization).toContain('Credential=AKIA_FIXTURE_KEY/');
  expect(requestInit.headers.Authorization).toContain('/ap-southeast-1/ses/aws4_request');

  const payload = JSON.parse(requestInit.body);
  expect(payload.FromEmailAddress).toBe('TICKET <tickets@company.com>');
  expect(payload.Destination.ToAddresses).toEqual(['test@company.com']);
  expect(payload.Content.Simple.Subject.Data).toBe('OTP');
  expect(payload.Content.Simple.Body.Text.Data).toBe('fixture text');
  expect(payload.Content.Simple.Body.Html.Data).toBe('<p>fixture html</p>');
});

it('throws descriptive error upon SES rejection or failure (AC-127)', async () => {
  vi.stubEnv('EMAIL_FROM', 'TICKET <tickets@company.com>');
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        __type: 'MessageRejected',
        message: 'Email address is not verified.',
      }),
      { status: 400 },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);

  const transport = createSesTransport({
    accessKeyId: 'AKIA_FIXTURE_KEY',
    secretAccessKey: 'secret_fixture_key',
    region: 'ap-southeast-1',
  });

  await expect(
    transport.send({
      from: 'noreply@ticket.invalid',
      to: 'unverified@external.com',
      subject: 'OTP',
      text: 'fixture',
    }),
  ).rejects.toThrow('SES email delivery failed: 400');
});

it('captures email locally in development when credentials are unset', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  clearCapturedEmails();

  const transport = createSesTransport({
    accessKeyId: '',
    secretAccessKey: '',
  });

  const res = await transport.send({
    from: 'noreply@ticket.invalid',
    to: 'customer@test.local',
    subject: 'คำสั่งซื้อสำเร็จ',
    text: 'ตั๋วของคุณ',
  });

  expect(res.id).toMatch(/^local-msg-/);
  const captured = getCapturedEmails();
  expect(captured).toHaveLength(1);
  expect(captured[0].to).toBe('customer@test.local');
  expect(captured[0].subject).toBe('คำสั่งซื้อสำเร็จ');
});

it('provides createResendTransport as an alias to createSesTransport for backwards compatibility', () => {
  expect(createResendTransport).toBe(createSesTransport);
});
