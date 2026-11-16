import { createHmac, timingSafeEqual } from 'node:crypto';

export interface OfflineAssignmentClaims {
  eventId: string;
  scannerId: string;
  assignmentEpoch: number;
}

function assignmentSecret(): string {
  const secret = process.env.OFFLINE_ASSIGNMENT_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== 'production') return 'ticket-offline-assignment-local-test-only-secret';
  throw new Error('OFFLINE_ASSIGNMENT_SECRET or BETTER_AUTH_SECRET must contain at least 32 characters');
}

function signature(value: string, secret = assignmentSecret()): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

export function createOfflineAssignmentToken(claims: OfflineAssignmentClaims): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, ...claims })).toString('base64url');
  const signed = `v1.${payload}`;
  return `${signed}.${signature(signed).toString('base64url')}`;
}

export function verifyOfflineAssignmentToken(
  token: string,
  expected: OfflineAssignmentClaims,
): boolean {
  try {
    const [version, payload, encodedSignature, extra] = token.split('.');
    if (version !== 'v1' || !payload || !encodedSignature || extra !== undefined) return false;
    const signed = `${version}.${payload}`;
    const received = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = signature(signed);
    if (received.length !== expectedSignature.length || !timingSafeEqual(received, expectedSignature)) return false;

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<OfflineAssignmentClaims> & { v?: number };
    return claims.v === 1 && claims.eventId === expected.eventId && claims.scannerId === expected.scannerId &&
      Number(claims.assignmentEpoch) === expected.assignmentEpoch;
  } catch {
    return false;
  }
}
