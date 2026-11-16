import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const QUEUE_COOKIE_NAME = 'ticket_queue_pass';

interface QueueCookieClaims {
  eventId: string;
  entryToken: string;
  sessionId: string;
  expiresAt: number;
}

function signingKey(): string {
  const secret = process.env.QUEUE_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('QUEUE_TOKEN_SECRET or BETTER_AUTH_SECRET must contain at least 32 characters');
  }
  return secret || 'ticket-local-queue-cookie-secret';
}

function sign(value: string): string {
  return createHmac('sha256', signingKey()).update(value).digest('base64url');
}

function parseCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === QUEUE_COOKIE_NAME) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

export function readQueueCookie(
  request: Request,
  eventId: string,
  now = Date.now(),
): Pick<QueueCookieClaims, 'entryToken' | 'sessionId'> | null {
  try {
    const raw = parseCookieHeader(request.headers.get('cookie'));
    if (!raw) return null;
    const separator = raw.lastIndexOf('.');
    if (separator <= 0) return null;
    const encoded = raw.slice(0, separator);
    const suppliedSignature = Buffer.from(raw.slice(separator + 1), 'base64url');
    const expectedSignature = Buffer.from(sign(encoded), 'base64url');
    if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
      return null;
    }
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as QueueCookieClaims;
    if (
      claims.eventId !== eventId ||
      typeof claims.entryToken !== 'string' ||
      typeof claims.sessionId !== 'string' ||
      !Number.isFinite(claims.expiresAt) ||
      claims.expiresAt <= now
    ) {
      return null;
    }
    return { entryToken: claims.entryToken, sessionId: claims.sessionId };
  } catch {
    return null;
  }
}

export function createQueueSessionId(): string {
  return randomUUID();
}

export function serializeQueueCookie(
  eventId: string,
  entryToken: string,
  sessionId: string,
  maxAgeSeconds = 30 * 60,
): string {
  const encoded = Buffer.from(JSON.stringify({
    eventId,
    entryToken,
    sessionId,
    expiresAt: Date.now() + maxAgeSeconds * 1000,
  } satisfies QueueCookieClaims)).toString('base64url');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${QUEUE_COOKIE_NAME}=${encoded}.${sign(encoded)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}
