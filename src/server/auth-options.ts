import type { BetterAuthOptions } from 'better-auth';
import type { Pool } from 'pg';
import { maximumPasswordLength, minimumPasswordLength } from '../lib/bootstrap-input.ts';
import { recordPasswordResetTokenIdentifier } from './password-reset.ts';
import { hashPasswordResetIdentifier } from './password-reset-hash.ts';

export function authOptions(pool: Pool, settings: { baseURL: string; secret: string }) {
  if (settings.secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
  const url = new URL(settings.baseURL);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || (!local && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BETTER_AUTH_URL must be an HTTPS origin (HTTP is allowed on loopback only)');
  }
  const trustedOrigins = [url.origin];
  const trustedProxy = process.env.TRUST_PROXY?.trim().toLowerCase();
  const ipAddressHeaders = trustedProxy === 'cloudflare'
    ? ['cf-connecting-ip', 'x-forwarded-for']
    : trustedProxy && Number.isInteger(Number(trustedProxy)) && Number(trustedProxy) > 0
      ? ['x-forwarded-for']
      : [];
  return {
    appName: 'TICKET',
    baseURL: url.origin,
    secret: settings.secret,
    database: pool,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: minimumPasswordLength,
      maxPasswordLength: maximumPasswordLength,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        // Better Auth revokes database sessions as part of reset. Keep this explicit
        // delete as a defense-in-depth guarantee for the configured auth_session table.
        await pool.query('DELETE FROM auth_session WHERE "userId" = $1', [user.id]);
      },
      sendResetPassword: async ({ user, url, token }) => {
        await recordPasswordResetTokenIdentifier(pool, user.id, `reset-password:${token}`);
        const { emailTransport } = await import('./email.ts');
        const { readScenarioEmailTemplate, interpolateEmailVariables } = await import('./email-master-template.ts');

        let subject = 'ตั้งรหัสผ่านใหม่สำหรับระบบ TICKET';
        let html = `
          <div style="font-family: sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
            <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; padding: 24px;">
              <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #0f172a;">TICKET - ตั้งรหัสผ่านใหม่</h2>
              <p style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">เรียนคุณ ${user.name || user.email},</p>
              <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 24px;">
                ระบบได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีผู้ใช้งานระบบหลังบ้านของท่าน กรุณากดปุ่มด้านล่างนี้เพื่อดำเนินการตั้งรหัสผ่านใหม่:
              </div>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${url}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
                  ตั้งรหัสผ่านใหม่
                </a>
              </div>
              <div style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 24px; line-height: 1.6;">
                ลิงก์นี้มีอายุการใช้งาน 30 นาทีและใช้ได้เพียงครั้งเดียว หากท่านไม่ได้เป็นผู้ทำรายการ โปรดแจ้งผู้ดูแลระบบทันที
              </div>
            </div>
          </div>
        `;

        try {
          const template = await readScenarioEmailTemplate(pool, 'password_reset');
          const vars = {
            user_name: user.name || user.email,
            request_time: new Date().toLocaleDateString('th-TH'),
            expire_minutes: '30',
          };
          if (template.subject) {
            subject = interpolateEmailVariables(template.subject, vars);
          }
          const greeting = template.greetingText
            ? interpolateEmailVariables(template.greetingText, vars)
            : `เรียนคุณ ${user.name || user.email},`;
          const bodyText = template.bodyText
            ? interpolateEmailVariables(template.bodyText, vars).replace(/\n/g, '<br/>')
            : 'ระบบได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีผู้ใช้งานระบบหลังบ้านของท่าน กรุณากดปุ่มด้านล่างนี้เพื่อดำเนินการตั้งรหัสผ่านใหม่:';
          const footerNotes = template.footerNotes
            ? interpolateEmailVariables(template.footerNotes, vars).replace(/\n/g, '<br/>')
            : 'ลิงก์นี้มีอายุการใช้งาน 30 นาทีและใช้ได้เพียงครั้งเดียว หากท่านไม่ได้เป็นผู้ทำรายการ โปรดแจ้งผู้ดูแลระบบทันที';

          html = `
            <div style="font-family: sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
              <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; padding: 24px;">
                <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #0f172a;">${template.headerTitle || 'TICKET - ตั้งรหัสผ่านใหม่'}</h2>
                <p style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">${greeting}</p>
                <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 24px;">
                  ${bodyText}
                </div>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${url}" style="background-color: ${template.primaryButtonColor || '#0f172a'}; color: ${template.primaryButtonTextColor || '#ffffff'}; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
                    ${template.primaryButtonText || 'ตั้งรหัสผ่านใหม่'}
                  </a>
                </div>
                <div style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 24px; line-height: 1.6;">
                  ${footerNotes}
                </div>
              </div>
            </div>
          `;
        } catch {
          // Fallback
        }

        await emailTransport.send({
          from: 'noreply@ticket.invalid',
          to: user.email,
          subject,
          text: `คุณได้ขอตั้งรหัสผ่านใหม่ กรุณาคลิกลิงก์ด้านล่างภายใน 30 นาที:\n${url}`,
          html,
        });
      },
    },
    verification: {
      modelName: 'auth_verification',
      storeIdentifier: {
        default: 'plain',
        overrides: {
          'reset-password:': {
            hash: async (identifier: string) => hashPasswordResetIdentifier(identifier),
          },
        },
      },
    },
    user: {
      modelName: 'auth_user',
      additionalFields: {
        role: { type: ['owner', 'organizer', 'scanner'], required: true, defaultValue: 'organizer', input: false },
      },
    },
    account: { modelName: 'auth_account' },
    session: {
      modelName: 'auth_session',
      expiresIn: 8 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: 'database', modelName: 'auth_rate_limit', window: 60, max: 100 },
    advanced: {
      cookiePrefix: 'ticket',
      useSecureCookies: url.protocol === 'https:',
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: { ipAddressHeaders },
    },
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
