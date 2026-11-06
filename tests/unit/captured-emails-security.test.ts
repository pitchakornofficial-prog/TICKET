import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET } from '../../src/app/api/dev/captured-emails/route';
import * as emailModule from '../../src/server/email';

describe('/api/dev/captured-emails security gating', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('rejects with 404 when NODE_ENV is production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    (process.env as Record<string, string | undefined>).ENABLE_DEV_MAIL_PREVIEW = 'true';

    const request = new Request('http://localhost:3000/api/dev/captured-emails', {
      headers: { host: 'localhost:3000' },
    });
    const response = await GET(request);
    expect(response.status).toBe(404);
  });

  it('rejects with 404 when ENABLE_DEV_MAIL_PREVIEW is not set to "true"', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    delete process.env.ENABLE_DEV_MAIL_PREVIEW;

    const request = new Request('http://localhost:3000/api/dev/captured-emails', {
      headers: { host: 'localhost:3000' },
    });
    const response = await GET(request);
    expect(response.status).toBe(404);
  });

  it('rejects with 404 when request is from an external hostname', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    (process.env as Record<string, string | undefined>).ENABLE_DEV_MAIL_PREVIEW = 'true';

    const request = new Request('https://staging.ticket.company.com/api/dev/captured-emails', {
      headers: { host: 'staging.ticket.company.com' },
    });
    const response = await GET(request);
    expect(response.status).toBe(404);
  });

  it('rejects with 404 when x-forwarded-for originates from a remote client', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    (process.env as Record<string, string | undefined>).ENABLE_DEV_MAIL_PREVIEW = 'true';

    const request = new Request('http://localhost:3000/api/dev/captured-emails', {
      headers: {
        host: 'localhost:3000',
        'x-forwarded-for': '203.0.113.195, 127.0.0.1',
      },
    });
    const response = await GET(request);
    expect(response.status).toBe(404);
  });

  it('allows GET with 200 and returns captured emails on loopback when flag is enabled', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    (process.env as Record<string, string | undefined>).ENABLE_DEV_MAIL_PREVIEW = 'true';

    vi.spyOn(emailModule, 'getCapturedEmails').mockReturnValue([
      {
        from: 'no-reply@ticket.internal',
        to: 'buyer@example.com',
        subject: 'ยืนยันคำสั่งซื้อ',
        html: '<p>test</p>',
        text: 'test',
      },
    ]);

    const request = new Request('http://127.0.0.1:3000/api/dev/captured-emails', {
      headers: { host: '127.0.0.1:3000' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.emails).toHaveLength(1);
    expect(body.emails[0].to).toBe('buyer@example.com');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('allows DELETE with 200 on loopback when flag is enabled', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    (process.env as Record<string, string | undefined>).ENABLE_DEV_MAIL_PREVIEW = 'true';

    const clearSpy = vi.spyOn(emailModule, 'clearCapturedEmails').mockImplementation(() => {});

    const request = new Request('http://localhost:3000/api/dev/captured-emails', {
      method: 'DELETE',
      headers: { host: 'localhost:3000' },
    });
    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
