import { createHash } from 'node:crypto';

/** Hashes Better Auth's complete password-reset verification identifier. */
export function hashPasswordResetIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier, 'utf8').digest('base64url');
}
