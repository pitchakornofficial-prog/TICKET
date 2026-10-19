import type { Pool } from 'pg';
import { inTransaction } from './database.ts';

// ADR-0004 security parameters:
// - Password-reset link valid for 30 minutes
// - Reset email resend: at least 60s cooldown, at most 3 requests per 15 minutes per account
// - New link replaces older active links
// - Stored in shared database

export const RESET_COOLDOWN_SECONDS = 60;
export const RESET_WINDOW_SECONDS = 15 * 60; // 900 seconds
export const RESET_MAX_REQUESTS_IN_WINDOW = 3;
export const RESET_TOKEN_EXPIRATION_SECONDS = 30 * 60; // 1800 seconds

export async function checkAndRecordResetRequest(
  pool: Pool,
  email: string,
  now = new Date(),
): Promise<{ allowed: boolean; reason?: 'cooldown' | 'max_limit' }> {
  const normalizedEmail = email.trim().toLowerCase();
  const nowMs = now.getTime();

  return inTransaction(pool, async client => {
    // Check if user exists first to decide if tracking applies (without revealing to client)
    const userRes = await client.query('SELECT id FROM auth_user WHERE email = $1', [normalizedEmail]);
    if (userRes.rowCount === 0) {
      // If user doesn't exist, we don't store throttling against nonexistent accounts,
      // but return allowed: false internally or allowed: true to keep response generic
      return { allowed: false, reason: 'cooldown' };
    }
    const userId = userRes.rows[0].id;

    // Check rate limit records for this key
    const key = `reset_pwd:${userId}`;
    const rateRes = await client.query(
      'SELECT count, "lastRequest" FROM auth_rate_limit WHERE key = $1',
      [key],
    );

    if (rateRes.rowCount && rateRes.rowCount > 0) {
      const row = rateRes.rows[0];
      const count = Number(row.count);
      const lastRequestMs = Number(row.lastRequest);

      // 60-second cooldown
      if (nowMs - lastRequestMs < RESET_COOLDOWN_SECONDS * 1000) {
        return { allowed: false, reason: 'cooldown' };
      }

      // 15-minute sliding window check
      if (nowMs - lastRequestMs < RESET_WINDOW_SECONDS * 1000) {
        if (count >= RESET_MAX_REQUESTS_IN_WINDOW) {
          return { allowed: false, reason: 'max_limit' };
        }
        await client.query(
          'UPDATE auth_rate_limit SET count = count + 1, "lastRequest" = $1 WHERE key = $2',
          [nowMs, key],
        );
      } else {
        // Window expired, reset count to 1
        await client.query(
          'UPDATE auth_rate_limit SET count = 1, "lastRequest" = $1 WHERE key = $2',
          [nowMs, key],
        );
      }
    } else {
      await client.query(
        'INSERT INTO auth_rate_limit (id, key, count, "lastRequest") VALUES ($1, $2, $3, $4)',
        [`rate_${Math.random().toString(36).slice(2)}`, key, 1, nowMs],
      );
    }

    // Invalidate any older active verification tokens for this user
    await client.query(
      'DELETE FROM auth_verification WHERE identifier LIKE $1 AND value = $2',
      ['reset-password:%', userId],
    );

    return { allowed: true };
  });
}
