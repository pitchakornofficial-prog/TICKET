import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearCapturedEmails,
  createSesTransport,
  getCapturedEmails,
  isNonRoutableEmailAddress,
  setCustomEmailTransport,
} from '../../src/server/email';
import { validateBuyerDetails } from '../../src/server/guest-otp';

afterEach(() => {
  setCustomEmailTransport(null);
  clearCapturedEmails();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('SES Test Isolation & Non-Routable Domain Guardrails', () => {
  it('clears .env.local external provider secrets in Vitest environment', () => {
    expect(process.env.SES_ACCESS_KEY_ID).toBe('');
    expect(process.env.SES_SECRET_ACCESS_KEY).toBe('');
    expect(process.env.STRIPE_SECRET_KEY).toBe('');
    expect(process.env.R2_ACCESS_KEY_ID).toBe('');
  });

  it('detects RFC 2606 / RFC 6761 non-routable and test domains accurately', () => {
    expect(isNonRoutableEmailAddress('racer-a@ticket.invalid')).toBe(true);
    expect(isNonRoutableEmailAddress('Buyer <buyer@demo.test>')).toBe(true);
    expect(isNonRoutableEmailAddress('user@localhost')).toBe(true);
    expect(isNonRoutableEmailAddress('owner@ticket.local')).toBe(true);
    expect(isNonRoutableEmailAddress('guest@example.com')).toBe(true);
    expect(isNonRoutableEmailAddress('sub@mail.example.org')).toBe(true);
    expect(isNonRoutableEmailAddress('buyer@test.example')).toBe(true);

    expect(isNonRoutableEmailAddress('customer@gmail.com')).toBe(false);
    expect(isNonRoutableEmailAddress('TICKET <tickets@phatysd.me>')).toBe(false);
  });

  it('keeps default Vitest transport in local capture mode even if SES env vars are stubbed', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SES_ACCESS_KEY_ID', 'AKIA_SHOULD_NOT_SEND');
    vi.stubEnv('SES_SECRET_ACCESS_KEY', 'secret_should_not_send');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const transport = createSesTransport();
    const res = await transport.send({
      from: 'no-reply@ticket.local',
      to: 'racer-a@ticket.invalid',
      subject: 'OTP Test',
      text: '123456',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.id).toMatch(/^local-msg-/);
    expect(getCapturedEmails()).toHaveLength(1);
    expect(getCapturedEmails()[0].to).toBe('racer-a@ticket.invalid');
  });

  it('suppresses SES HTTP call in non-production runtime when destination is non-routable', async () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SES_ACCESS_KEY_ID', 'AKIA_DEV_KEY');
    vi.stubEnv('SES_SECRET_ACCESS_KEY', 'secret_dev_key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const transport = createSesTransport();
      const res = await transport.send({
        from: 'tickets@phatysd.me',
        to: 'racer-a@ticket.invalid',
        subject: 'OTP Dev',
        text: '654321',
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(res.id).toMatch(/^local-suppressed-/);
      expect(getCapturedEmails()).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('blocks SES HTTP call in production runtime for non-routable test domains', async () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SES_ACCESS_KEY_ID', 'AKIA_PROD_KEY');
    vi.stubEnv('SES_SECRET_ACCESS_KEY', 'secret_prod_key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const transport = createSesTransport();
    await expect(
      transport.send({
        from: 'tickets@phatysd.me',
        to: 'racer-a@ticket.invalid',
        subject: 'OTP Prod',
        text: '704821',
      }),
    ).rejects.toThrow(/non-routable domain/);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCapturedEmails()).toHaveLength(0);
  });

  it('rejects non-routable test domains in guest OTP validation under live production SES config', () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SES_ACCESS_KEY_ID', 'AKIA_PROD_KEY');

    const blocked = validateBuyerDetails({
      name: 'Racer A',
      email: 'racer-a@ticket.invalid',
      phone: '0812345678',
    });
    expect(blocked.valid).toBe(false);
    expect(blocked.error).toContain('อีเมลที่ใช้งานได้จริง');

    const allowed = validateBuyerDetails({
      name: 'Real Buyer',
      email: 'buyer@gmail.com',
      phone: '0812345678',
    });
    expect(allowed.valid).toBe(true);
  });
});
