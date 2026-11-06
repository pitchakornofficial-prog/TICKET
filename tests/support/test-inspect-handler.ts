import type { Pool } from 'pg';
import { ensureGuestOtpSchema } from '../../src/server/guest-otp.ts';

export async function handleTestInspectRequest(
  pool: Pool,
  requestUrl: string,
): Promise<{ status: number; body: unknown }> {
  const url = new URL(requestUrl, 'http://127.0.0.1:3100');
  const email = url.searchParams.get('email') || '';
  const clearCooldown = url.searchParams.get('clearCooldown') === 'true';

  if (clearCooldown && email) {
    const uRes = await pool.query('SELECT id FROM auth_user WHERE email = $1', [email]);
    if (uRes.rowCount && uRes.rowCount > 0) {
      await pool.query('DELETE FROM auth_rate_limit WHERE key = $1', [`reset_pwd:${uRes.rows[0].id}`]);
    }
    return { status: 200, body: { cleared: true } };
  }

  const type = url.searchParams.get('type') || 'reset';
  if (type === 'clear_guest_cooldown' && email) {
    await pool.query('DELETE FROM guest_otp_tracking WHERE key LIKE $1', [`${email}:%`]);
    return { status: 200, body: { cleared: true } };
  }

  if (type === 'expire_order') {
    const orderId = url.searchParams.get('orderId') || '';
    if (orderId) {
      await pool.query(
        `UPDATE orders
         SET "expiresAt" = now() - interval '1 second', status = 'expired', "updatedAt" = now()
         WHERE id = $1`,
        [orderId],
      );
      return { status: 200, body: { expired: true } };
    }
  }

  if (type === 'guest_otp') {
    try {
      await ensureGuestOtpSchema(pool);
    } catch {
      // ignore schema error
    }
    const otpRes = await pool.query(
      'SELECT code, "requestId" FROM guest_otp WHERE email = $1 AND "consumedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1',
      [email],
    );
    if (otpRes.rowCount === 0) {
      return { status: 404, body: { code: null } };
    }

    const { getCapturedEmails } = await import('../../src/server/email.ts');
    const emails = getCapturedEmails().filter((e) => e.to === email);
    const lastEmail = emails.at(-1);
    const match = lastEmail?.text?.match(/\b(\d{6})\b/) || lastEmail?.subject?.match(/\b(\d{6})\b/);
    const code = match ? match[1] : otpRes.rows[0].code;

    return {
      status: 200,
      body: { code, requestId: otpRes.rows[0].requestId },
    };
  }

  if (type === 'invitation') {
    const { getCapturedEmails } = await import('../../src/server/email.ts');
    const captured = getCapturedEmails().filter((e) => e.to === email);
    const lastEmail = captured[captured.length - 1];
    if (lastEmail?.text) {
      const match = lastEmail.text.match(/accept-invitation\?token=([a-zA-Z0-9_-]+)/);
      if (match) {
        return { status: 200, body: { token: match[1] } };
      }
    }
    const invRes = await pool.query(
      'SELECT token FROM organizer_invitations WHERE email = $1 ORDER BY "createdAt" DESC LIMIT 1',
      [email],
    );
    if (invRes.rowCount === 0) {
      return { status: 404, body: { token: null } };
    }
    return { status: 200, body: { token: invRes.rows[0].token } };
  }

  const userRes = await pool.query('SELECT id FROM auth_user WHERE email = $1', [email]);
  if (userRes.rowCount === 0) {
    return { status: 404, body: { token: null } };
  }
  const userId = userRes.rows[0].id;
  const tokenRes = await pool.query(
    'SELECT identifier FROM auth_verification WHERE value = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [userId],
  );
  if (tokenRes.rowCount === 0) {
    return { status: 404, body: { token: null } };
  }
  const token = tokenRes.rows[0].identifier.replace('reset-password:', '');
  return { status: 200, body: { token } };
}
