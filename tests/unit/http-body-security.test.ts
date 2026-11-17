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
