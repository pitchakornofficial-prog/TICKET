import { afterEach, expect, it, vi } from 'vitest';
import { createResendTransport } from '../../src/server/email';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('refuses local capture when production has no Resend key', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  await expect(createResendTransport('').send({ from: 'noreply@ticket.invalid', to: 'test@company.com', subject: 'OTP', text: 'fixture' })).rejects.toThrow('RESEND_API_KEY');
});

it('uses the configured verified sender for every Resend message', async () => {
  vi.stubEnv('EMAIL_FROM', 'TICKET <tickets@company.com>');
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'fixture' })));
  vi.stubGlobal('fetch', fetchMock);
  await createResendTransport('re_fixture').send({ from: 'noreply@ticket.invalid', to: 'test@company.com', subject: 'OTP', text: 'fixture' });
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload.from).toBe('TICKET <tickets@company.com>');
});
