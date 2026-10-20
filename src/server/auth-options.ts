import type { BetterAuthOptions } from 'better-auth';
import type { Pool } from 'pg';
import { maximumPasswordLength, minimumPasswordLength } from '../lib/bootstrap-input.ts';

export function authOptions(pool: Pool, settings: { baseURL: string; secret: string }) {
  if (settings.secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
  const url = new URL(settings.baseURL);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || (!local && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BETTER_AUTH_URL must be an HTTPS origin (HTTP is allowed on loopback only)');
  }
  return {
    appName: 'TICKET',
    baseURL: url.origin,
    secret: settings.secret,
    database: pool,
    trustedOrigins: [url.origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: minimumPasswordLength,
      maxPasswordLength: maximumPasswordLength,
      resetPasswordTokenExpiresIn: 30 * 60,
      sendResetPassword: async ({ user, url }) => {
        const { emailTransport } = await import('./email.ts');
        await emailTransport.send({
          from: 'noreply@ticket.invalid',
          to: user.email,
          subject: 'ตั้งรหัสผ่านใหม่สำหรับระบบ TICKET',
          text: `คุณได้ขอตั้งรหัสผ่านใหม่ กรุณาคลิกลิงก์ด้านล่างภายใน 30 นาที:\n${url}`,
        });
      },
    },
    user: {
      modelName: 'auth_user',
      additionalFields: {
        role: { type: ['owner', 'organizer', 'scanner'], required: true, defaultValue: 'organizer', input: false },
      },
    },
    account: { modelName: 'auth_account' },
    verification: { modelName: 'auth_verification' },
    session: {
      modelName: 'auth_session',
      expiresIn: 8 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: 'database', modelName: 'auth_rate_limit', window: 60, max: 100 },
    advanced: { cookiePrefix: 'ticket', useSecureCookies: url.protocol === 'https:', disableOriginCheck: false, disableCSRFCheck: false },
    telemetry: { enabled: false },
    logger: {
      log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: unknown[]) => {
        if (message.includes('Could not validate the database schema')) return;
        if (level === 'error') console.error(message, ...args);
        else if (level === 'warn') console.warn(message, ...args);
        else console.log(message, ...args);
      },
    },
  } satisfies BetterAuthOptions;
}
