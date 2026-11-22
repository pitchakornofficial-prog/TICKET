import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPayloadTooLargeError, readBoundedJson, readBoundedStream, readBoundedText } from '../../src/server/http-body';

const mocks = vi.hoisted(() => ({ getDatabasePool: vi.fn() }));

vi.mock('@/server/database', () => ({ getDatabasePool: mocks.getDatabasePool }));

import { POST as requestCheckoutOtp } from '../../src/app/api/public/checkout/request-otp/route';

function streamedRequest(url: string, chunks: Uint8Array[], headers: Record<string, string> = {}): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request(url, {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('bounded HTTP body readers', () => {
  beforeEach(() => mocks.getDatabasePool.mockReset());

  it('returns a 413 error and cancels a stream that exceeds the byte ceiling without Content-Length', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(3));
      },
      cancel,
    });

    await expect(readBoundedStream(stream, 6)).rejects.toMatchObject({
      status: 413,
      message: 'PAYLOAD_TOO_LARGE',
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('reads text and JSON using UTF-8 byte counts', async () => {
    const json = streamedRequest('http://127.0.0.1/body', [new TextEncoder().encode('{"ok":true}')]);
    await expect(readBoundedJson<{ ok: boolean }>(json, 11)).resolves.toEqual({ ok: true });

    const text = streamedRequest('http://127.0.0.1/body', [new TextEncoder().encode('é')]);
    await expect(readBoundedText(text, 2)).resolves.toBe('é');
  });

  it('rejects oversized public checkout JSON with 413 before database access', async () => {
    const payload = new TextEncoder().encode(`{"buyer":{"name":"${'x'.repeat(32 * 1024)}"}}`);
    const request = streamedRequest(
      'http://127.0.0.1:3000/api/public/checkout/request-otp',
      [payload],
      { 'content-type': 'application/json' },
    );

    expect(request.headers.has('content-length')).toBe(false);
    const response = await requestCheckoutOtp(request);
    expect(response.status).toBe(413);
    expect(isPayloadTooLargeError(new Error('PAYLOAD_TOO_LARGE'))).toBe(true);
    expect(mocks.getDatabasePool).not.toHaveBeenCalled();
  });
});

describe('auth HTTP body limits', () => {
  it.each(['sign-in/email', 'request-password-reset'])(
    'rejects oversized streamed JSON on %s before dispatch',
    async (path) => {
      const { handleAuthRequest } = await import('../../src/server/auth-http');
      const handler = vi.fn();
      const auth = { options: { baseURL: 'http://127.0.0.1:3000' }, handler } as unknown as
        Parameters<typeof handleAuthRequest>[0];
      const request = streamedRequest(
        `http://127.0.0.1:3000/api/auth/${path}`,
        [new Uint8Array(24 * 1024), new Uint8Array(12 * 1024)],
        { origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' },
      );

      expect((await handleAuthRequest(auth, request)).status).toBe(413);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('forwards normal sign-in JSON and cookies after checking the body', async () => {
    const { handleAuthRequest } = await import('../../src/server/auth-http');
    const body = { email: 'buyer@example.test', password: 'example-password' };
    const handler = vi.fn(async (request: Request) => {
      expect(request.headers.get('cookie')).toBe('example=session');
      expect(await request.json()).toEqual(body);
      return new Response(null, { status: 204 });
    });
    const auth = { options: { baseURL: 'http://127.0.0.1:3000' }, handler } as unknown as
      Parameters<typeof handleAuthRequest>[0];
    const request = new Request('http://127.0.0.1:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        origin: 'http://127.0.0.1:3000',
        'content-type': 'application/json',
        cookie: 'example=session',
      },
      body: JSON.stringify(body),
    });

    expect((await handleAuthRequest(auth, request)).status).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('forwards proxied Request objects (Next.js runtime) without touching Request private #state', async () => {
    const { handleAuthRequest } = await import('../../src/server/auth-http');
    const body = { email: 'owner@example.test', password: 'example-password' };
    const handler = vi.fn(async (request: Request) => {
      expect(request.headers.get('cookie')).toBe('example=proxied');
      expect(await request.json()).toEqual(body);
      return new Response(null, { status: 204 });
    });
    const auth = { options: { baseURL: 'http://127.0.0.1:3000' }, handler } as unknown as
      Parameters<typeof handleAuthRequest>[0];
    const underlying = new Request('http://127.0.0.1:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        origin: 'http://127.0.0.1:3000',
        'content-type': 'application/json',
        cookie: 'example=proxied',
      },
      body: JSON.stringify(body),
    });
    const proxied = new Proxy(underlying, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    expect((await handleAuthRequest(auth, proxied)).status).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
  });
});
