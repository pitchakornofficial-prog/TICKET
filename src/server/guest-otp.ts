import { randomInt, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { emailTransport } from './email.ts';
import { inTransaction } from './database.ts';

// ADR-0004 & SPEC-001 (AC-57, AC-58, AC-59, AC-60) security parameters:
// - 6-digit random code
// - 5-minute validity (300 seconds)
// - One-time use bound to email, purpose, and request
// - Resend: at least 60s cooldown, max 5 requests per 15 minutes per email/purpose; new code invalidates older active code
// - Failed attempts: 5 wrong guesses per 15 minutes per email/purpose locks out verification for 15 minutes; requesting new code does NOT reset fail counter
// - Stored in shared database

export const OTP_EXPIRATION_SECONDS = 5 * 60; // 300s
export const OTP_RESEND_COOLDOWN_SECONDS = 60; // 60s
export const OTP_WINDOW_SECONDS = 15 * 60; // 900s
export const OTP_MAX_REQUESTS_IN_WINDOW = 5;
export const OTP_MAX_FAILS_IN_WINDOW = 5;
export const OTP_LOCKOUT_SECONDS = 15 * 60; // 900s
export const VERIFIED_SESSION_EXPIRATION_SECONDS = 30 * 60; // 1800s

export interface GuestBuyerDetails {
  name: string;
  email: string;
  phone: string;
}

export interface GuestVerifiedSession {
  token: string;
  email: string;
  name: string;
  phone: string;
  purpose: string;
  verifiedAt: string;
  expiresAt: string;
}

export async function ensureGuestOtpSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guest_otp (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code TEXT NOT NULL,
      "requestId" TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "consumedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_guest_otp_lookup ON guest_otp(email, purpose, "createdAt" DESC);
    CREATE INDEX IF NOT EXISTS idx_guest_otp_request ON guest_otp("requestId");

    CREATE TABLE IF NOT EXISTS guest_otp_tracking (
      key TEXT PRIMARY KEY,
      "requestCount" INTEGER NOT NULL DEFAULT 0,
      "lastRequestAt" TIMESTAMPTZ NOT NULL,
      "failCount" INTEGER NOT NULL DEFAULT 0,
      "lastFailAt" TIMESTAMPTZ,
      "blockedUntil" TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS guest_verified_sessions (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      "verifiedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "expiresAt" TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_guest_verified_email ON guest_verified_sessions(email);
  `);
}

export function validateBuyerDetails(input: Partial<GuestBuyerDetails>): {
  valid: boolean;
  error?: string;
  data?: GuestBuyerDetails;
} {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();

  // AC-60: missing name, email, or phone prevents moving forward
  if (!name) {
    return { valid: false, error: 'กรุณากรอกชื่อ-นามสกุล' };
  }
  if (!email) {
    return { valid: false, error: 'กรุณากรอกอีเมล' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
  }
  if (!phone) {
    return { valid: false, error: 'กรุณากรอกเบอร์โทรศัพท์' };
  }
  const cleanPhone = phone.replace(/[\s-]/g, '');
  if (cleanPhone.length < 9 || cleanPhone.length > 15 || !/^\+?\d+$/.test(cleanPhone)) {
    return { valid: false, error: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง' };
  }

  return { valid: true, data: { name, email, phone: cleanPhone } };
}

export async function requestGuestOtp(
  pool: Pool,
  input: {
    buyer: Partial<GuestBuyerDetails>;
    purpose?: string;
    now?: Date;
  },
): Promise<{
  success: boolean;
  requestId?: string;
  cooldownSeconds?: number;
  expiresInSeconds?: number;
  error?: string;
  code?: 'MISSING_FIELDS' | 'COOLDOWN' | 'RATE_LIMITED' | 'BLOCKED';
}> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const purpose = input.purpose?.trim() || 'checkout';

  const validation = validateBuyerDetails(input.buyer);
  if (!validation.valid || !validation.data) {
    return { success: false, error: validation.error, code: 'MISSING_FIELDS' };
  }

  const { email, name } = validation.data;
  await ensureGuestOtpSchema(pool);

  return inTransaction(pool, async client => {
    const trackKey = `${email}:${purpose}`;
    const trackRes = await client.query(
      'SELECT "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil" FROM guest_otp_tracking WHERE key = $1',
      [trackKey],
    );

    let failCount = 0;
    let lastFailAt: Date | null = null;
    let blockedUntil: Date | null = null;

    if (trackRes.rowCount && trackRes.rowCount > 0) {
      const row = trackRes.rows[0];
      failCount = row.failCount ?? 0;
      lastFailAt = row.lastFailAt ? new Date(row.lastFailAt) : null;
      blockedUntil = row.blockedUntil ? new Date(row.blockedUntil) : null;

      // AC-59 Check if currently locked out
      if (blockedUntil && blockedUntil.getTime() > nowMs) {
        const remainingMinutes = Math.ceil((blockedUntil.getTime() - nowMs) / 60000);
        return {
          success: false,
          error: `ระบบระงับการตรวจสอบเนื่องจากใส่รหัสผิดเกินกำหนด กรุณารอ ${remainingMinutes} นาที`,
          code: 'BLOCKED',
        };
      }

      // Check 15-minute fail window expiry; if window expired, fail count can reset
      if (lastFailAt && nowMs - lastFailAt.getTime() > OTP_WINDOW_SECONDS * 1000) {
        failCount = 0;
        lastFailAt = null;
        blockedUntil = null;
      }

      const lastRequestAt = new Date(row.lastRequestAt);
      const diffRequestMs = nowMs - lastRequestAt.getTime();

      // AC-58: 60-second cooldown
      if (diffRequestMs < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
        const remainingSec = Math.ceil((OTP_RESEND_COOLDOWN_SECONDS * 1000 - diffRequestMs) / 1000);
        return {
          success: false,
          error: `กรุณารอ ${remainingSec} วินาทีก่อนขอรหัส OTP ใหม่`,
          cooldownSeconds: remainingSec,
          code: 'COOLDOWN',
        };
      }

      // AC-58: 15-minute window for max 5 requests
      let requestCount = row.requestCount;
      if (diffRequestMs < OTP_WINDOW_SECONDS * 1000) {
        if (requestCount >= OTP_MAX_REQUESTS_IN_WINDOW) {
          return {
            success: false,
            error: 'คุณขอรหัส OTP เกินจำนวนที่กำหนด (สูงสุด 5 ครั้งใน 15 นาที)',
            code: 'RATE_LIMITED',
          };
        }
        requestCount += 1;
      } else {
        requestCount = 1;
      }

      await client.query(
        `UPDATE guest_otp_tracking
         SET "requestCount" = $1, "lastRequestAt" = $2, "failCount" = $3, "lastFailAt" = $4, "blockedUntil" = $5
         WHERE key = $6`,
        [requestCount, now, failCount, lastFailAt, blockedUntil, trackKey],
      );
    } else {
      await client.query(
        `INSERT INTO guest_otp_tracking (key, "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil")
         VALUES ($1, 1, $2, 0, NULL, NULL)`,
        [trackKey, now],
      );
    }

    // AC-58: New OTP invalidates previous active OTPs for this email and purpose
    await client.query(
      `UPDATE guest_otp SET "consumedAt" = $1 WHERE email = $2 AND purpose = $3 AND "consumedAt" IS NULL`,
      [now, email, purpose],
    );

    // Generate 6-digit random code (100000 to 999999)
    const otpCode = randomInt(100000, 1000000).toString();
    const requestId = randomUUID();
    const expiresAt = new Date(nowMs + OTP_EXPIRATION_SECONDS * 1000);

    await client.query(
      `INSERT INTO guest_otp (id, email, purpose, code, "requestId", "expiresAt", "consumedAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)`,
      [randomUUID(), email, purpose, otpCode, requestId, expiresAt, now],
    );

    // Send email via transport
    const isLookup = purpose === 'order_lookup';
    const emailSubject = isLookup
      ? `รหัส OTP สำหรับค้นหาบัตร TICKET: ${otpCode}`
      : `รหัส OTP สำหรับการซื้อบัตร TICKET: ${otpCode}`;
    const actionTitle = isLookup ? 'ค้นหาและเปิดดูบัตร TICKET' : 'ยืนยันตัวตนสำหรับการซื้อบัตร TICKET';
    const actionDesc = isLookup ? 'ค้นหาบัตรคอนเสิร์ต' : 'ยืนยันการซื้อบัตร';

    await emailTransport.send({
      from: 'TICKET <no-reply@ticket.local>',
      to: email,
      subject: emailSubject,
      text: `สวัสดีคุณ ${name},\n\nรหัส OTP สำหรับ${actionDesc}ของคุณคือ: ${otpCode}\nรหัสนี้มีอายุการใช้งาน 5 นาที\n\nหากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลนี้`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #111214;">
          <h2>${actionTitle}</h2>
          <p>สวัสดีคุณ <strong>${name}</strong>,</p>
          <p>รหัส OTP เพื่อยืนยันอีเมลของคุณคือ:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1848ed; margin: 20px 0;">
            ${otpCode}
          </div>
          <p style="color: #6b7280; font-size: 14px;">รหัสนี้มีอายุการใช้งาน 5 นาที และใช้ได้เพียงครั้งเดียว</p>
        </div>
      `,
    });

    return {
      success: true,
      requestId,
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      expiresInSeconds: OTP_EXPIRATION_SECONDS,
    };
  });
}

export async function verifyGuestOtp(
  pool: Pool,
  input: {
    email: string;
    code: string;
    requestId: string;
    purpose?: string;
    buyer: Partial<GuestBuyerDetails>;
    now?: Date;
  },
): Promise<{
  success: boolean;
  verifiedToken?: string;
  buyer?: GuestBuyerDetails;
  error?: string;
  code?: 'INVALID_CODE' | 'EXPIRED' | 'REPLAY' | 'BLOCKED' | 'NOT_FOUND';
}> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const email = input.email?.trim().toLowerCase();
  const purpose = input.purpose?.trim() || 'checkout';
  const submittedCode = input.code?.trim();
  const requestId = input.requestId?.trim();

  if (!email || !submittedCode || !requestId) {
    return { success: false, error: 'ข้อมูลไม่ครบถ้วน', code: 'INVALID_CODE' };
  }

  const validation = validateBuyerDetails(input.buyer);
  if (!validation.valid || !validation.data) {
    return { success: false, error: validation.error, code: 'INVALID_CODE' };
  }
  const buyerData = validation.data;

  await ensureGuestOtpSchema(pool);

  return inTransaction(pool, async client => {
    const trackKey = `${email}:${purpose}`;
    const trackRes = await client.query(
      'SELECT "failCount", "lastFailAt", "blockedUntil" FROM guest_otp_tracking WHERE key = $1',
      [trackKey],
    );

    let failCount = 0;
    let lastFailAt: Date | null = null;
    let blockedUntil: Date | null = null;

    if (trackRes.rowCount && trackRes.rowCount > 0) {
      failCount = trackRes.rows[0].failCount ?? 0;
      lastFailAt = trackRes.rows[0].lastFailAt ? new Date(trackRes.rows[0].lastFailAt) : null;
      blockedUntil = trackRes.rows[0].blockedUntil ? new Date(trackRes.rows[0].blockedUntil) : null;

      // AC-59 Check lockout
      if (blockedUntil && blockedUntil.getTime() > nowMs) {
        const remainingMinutes = Math.ceil((blockedUntil.getTime() - nowMs) / 60000);
        return {
          success: false,
          error: `ระบบระงับการตรวจสอบเนื่องจากใส่รหัสผิดเกิน 5 ครั้ง กรุณารอ ${remainingMinutes} นาที`,
          code: 'BLOCKED',
        };
      }

      // Check 15-minute fail window
      if (lastFailAt && nowMs - lastFailAt.getTime() > OTP_WINDOW_SECONDS * 1000) {
        failCount = 0;
        lastFailAt = null;
        blockedUntil = null;
      }
    }

    // Look up OTP record by requestId, email, and purpose (AC-57: scope bound)
    const otpRes = await client.query(
      `SELECT id, code, "expiresAt", "consumedAt" FROM guest_otp
       WHERE "requestId" = $1 AND email = $2 AND purpose = $3`,
      [requestId, email, purpose],
    );

    if (otpRes.rowCount === 0) {
      return { success: false, error: 'ไม่พบคำขอ OTP หรือข้อมูลไม่ตรงกับคำขอ', code: 'NOT_FOUND' };
    }

    const otpRow = otpRes.rows[0];

    // AC-57: Replay check
    if (otpRow.consumedAt) {
      return { success: false, error: 'รหัส OTP นี้ถูกใช้งานไปแล้ว', code: 'REPLAY' };
    }

    // AC-57: Expiry check (5 minutes)
    const expiresAt = new Date(otpRow.expiresAt);
    if (nowMs > expiresAt.getTime()) {
      return { success: false, error: 'รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่', code: 'EXPIRED' };
    }

    // Code match check
    if (otpRow.code !== submittedCode) {
      failCount += 1;
      lastFailAt = now;
      let newBlockedUntil: Date | null = null;

      // AC-59: 5 wrong attempts locks out for 15 minutes
      if (failCount >= OTP_MAX_FAILS_IN_WINDOW) {
        newBlockedUntil = new Date(nowMs + OTP_LOCKOUT_SECONDS * 1000);
      }

      await client.query(
        `UPDATE guest_otp_tracking
         SET "failCount" = $1, "lastFailAt" = $2, "blockedUntil" = $3
         WHERE key = $4`,
        [failCount, lastFailAt, newBlockedUntil, trackKey],
      );

      if (newBlockedUntil) {
        return {
          success: false,
          error: 'คุณระบุรหัส OTP ผิดครบ 5 ครั้ง ระบบระงับการตรวจสอบเป็นเวลา 15 นาที',
          code: 'BLOCKED',
        };
      }

      const remaining = OTP_MAX_FAILS_IN_WINDOW - failCount;
      return {
        success: false,
        error: `รหัส OTP ไม่ถูกต้อง (เหลือโอกาสลองอีก ${remaining} ครั้ง)`,
        code: 'INVALID_CODE',
      };
    }

    // AC-57: Mark OTP as consumed (one-time use)
    await client.query(`UPDATE guest_otp SET "consumedAt" = $1 WHERE id = $2`, [now, otpRow.id]);

    // Reset fail count on successful verification
    await client.query(
      `UPDATE guest_otp_tracking SET "failCount" = 0, "lastFailAt" = NULL, "blockedUntil" = NULL WHERE key = $1`,
      [trackKey],
    );

    // Create verified session (NQ-06 implementation choice)
    const verifiedToken = randomUUID();
    const sessionExpiresAt = new Date(nowMs + VERIFIED_SESSION_EXPIRATION_SECONDS * 1000);

    await client.query(
      `INSERT INTO guest_verified_sessions (token, email, name, phone, purpose, "verifiedAt", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        verifiedToken,
        email,
        buyerData.name,
        buyerData.phone,
        purpose,
        now,
        sessionExpiresAt,
      ],
    );

    return {
      success: true,
      verifiedToken,
      buyer: buyerData,
    };
  });
}

export async function getVerifiedGuestSession(
  pool: Pool,
  token: string,
  now = new Date(),
): Promise<GuestVerifiedSession | null> {
  await ensureGuestOtpSchema(pool);
  const res = await pool.query(
    `SELECT token, email, name, phone, purpose, "verifiedAt", "expiresAt"
     FROM guest_verified_sessions
     WHERE token = $1 AND "expiresAt" > $2`,
    [token, now],
  );

  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return {
    token: row.token,
    email: row.email,
    name: row.name,
    phone: row.phone,
    purpose: row.purpose,
    verifiedAt: row.verifiedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}
