export class PayloadTooLargeError extends Error {
  readonly status = 413;

  constructor() {
    super('PAYLOAD_TOO_LARGE');
    this.name = 'PayloadTooLargeError';
  }
}

function isDeclaredBodyTooLarge(contentLength: string | null, maxBytes: number): boolean {
  if (!contentLength) return false;
  const normalized = contentLength.trim();
  return /^\d+$/.test(normalized) && Number(normalized) > maxBytes;
}

export async function readBoundedStream(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer');
  }
  if (!stream) return Buffer.alloc(0);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (totalBytes + value.byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PayloadTooLargeError();
      }
      totalBytes += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

export async function readBoundedRequestBytes(request: Request, maxBytes: number): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer');
  }
  if (isDeclaredBodyTooLarge(request.headers.get('content-length'), maxBytes)) {
    await request.body?.cancel().catch(() => undefined);
    throw new PayloadTooLargeError();
  }
  return readBoundedStream(request.body, maxBytes);
}

export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  const bytes = await readBoundedRequestBytes(request, maxBytes);
  return bytes.toString('utf8');
}

export async function readBoundedJson<T = unknown>(request: Request, maxBytes: number): Promise<T> {
  const text = await readBoundedText(request, maxBytes);
  return JSON.parse(text) as T;
}

export function isPayloadTooLargeError(error: unknown): boolean {
  return error instanceof PayloadTooLargeError
    || (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE');
}
