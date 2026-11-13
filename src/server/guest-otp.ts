import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { emailTransport, isNonRoutableEmailAddress } from './email.ts';
import { inTransaction } from './database.ts';
import { isRealPgPool } from './pg-pool-utils.ts';

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

// IP-level rate limiting (Issue #16): prevents distributed email spamming from a single IP
export const OTP_IP_WINDOW_SECONDS = 15 * 60; // 900s (15 minutes)
export const OTP_IP_MAX_REQUESTS_IN_WINDOW = 20; // 20 requests per IP per 15 minutes

export function hashOtpCode(code: string, salt: string): string {
  return createHmac('sha256', salt).update(code.trim()).digest('hex');
}

export function extractClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    const trimmed = cfIp.trim();
    if (trimmed) return trimmed;
  }
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }
  return '127.0.0.1';
}

export const ALLOWED_OTP_PURPOSES = ['checkout', 'order_lookup'] as const;
export type OtpPurpose = (typeof ALLOWED_OTP_PURPOSES)[number];

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

const guestOtpSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureGuestOtpSchema(pool: Pool): Promise<void> {
  const existing = guestOtpSchemaPromises.get(pool);
  if (existing) {
    return existing;
  }
  const promise = (async () => {
    try {
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
      if (isRealPgPool(pool)) {
        await inTransaction(pool, async client => {
          await client.query('SELECT pg_advisory_xact_lock($1)', [945162032]);
          await client.query(`
            CREATE OR REPLACE FUNCTION request_guest_otp_atomic_v1(
              p_email TEXT,
              p_purpose TEXT,
              p_ip_key TEXT,
              p_now TIMESTAMPTZ,
              p_otp_id TEXT,
              p_hashed_code TEXT,
              p_request_id TEXT,
              p_otp_expires_at TIMESTAMPTZ,
              p_resend_cooldown_ms BIGINT,
              p_window_ms BIGINT,
              p_ip_window_ms BIGINT,
              p_max_req INT,
              p_ip_max_req INT
            )
            RETURNS TABLE(outcome TEXT, err_message TEXT, cooldown_seconds INT)
            LANGUAGE plpgsql
            VOLATILE
            AS $$
            DECLARE
              v_track_key TEXT := p_email || ':' || p_purpose;
              v_global_key TEXT := p_email || ':global';
              v_keys TEXT[];
              v_ip_row RECORD;
              v_global_row RECORD;
              v_track_row RECORD;
              v_ip_req INT := 1;
              v_global_req INT := 1;
              v_track_req INT := 1;
              v_fail_count INT := 0;
              v_last_fail TIMESTAMPTZ := NULL;
              v_blocked TIMESTAMPTZ := NULL;
              v_diff_ms BIGINT;
              v_rem INT;
              v_track_found BOOLEAN := FALSE;
              v_global_found BOOLEAN := FALSE;
              v_ip_found BOOLEAN := FALSE;
            BEGIN
              IF p_ip_key IS NOT NULL THEN
                v_keys := ARRAY[p_ip_key, v_track_key, v_global_key];
              ELSE
                v_keys := ARRAY[v_track_key, v_global_key];
              END IF;

              PERFORM 1 FROM guest_otp_tracking WHERE key = ANY(v_keys) ORDER BY key FOR UPDATE;

              IF p_ip_key IS NOT NULL THEN
                SELECT "requestCount", "lastRequestAt" INTO v_ip_row FROM guest_otp_tracking WHERE key = p_ip_key;
                IF FOUND THEN
                  v_ip_found := TRUE;
                  v_diff_ms := ROUND(EXTRACT(EPOCH FROM (p_now - v_ip_row."lastRequestAt")) * 1000)::bigint;
                  IF v_diff_ms < p_ip_window_ms THEN
                    IF v_ip_row."requestCount" >= p_ip_max_req THEN
                      outcome := 'RATE_LIMITED';
                      err_message := 'คำขอรหัส OTP จาก IP ของท่านถี่เกินกำหนด กรุณารอสักครู่ (สูงสุด 20 ครั้งใน 15 นาที)';
                      cooldown_seconds := NULL;
                      RETURN NEXT;
                      RETURN;
                    END IF;
                    v_ip_req := v_ip_row."requestCount" + 1;
                  END IF;
                END IF;
              END IF;

              SELECT "requestCount", "lastRequestAt" INTO v_global_row FROM guest_otp_tracking WHERE key = v_global_key;
              IF FOUND THEN
                v_global_found := TRUE;
                v_diff_ms := ROUND(EXTRACT(EPOCH FROM (p_now - v_global_row."lastRequestAt")) * 1000)::bigint;
                IF v_diff_ms < p_resend_cooldown_ms THEN
                  v_rem := CEIL((p_resend_cooldown_ms - v_diff_ms)::numeric / 1000.0)::int;
                  outcome := 'COOLDOWN';
                  err_message := format('กรุณารอ %s วินาทีก่อนขอรหัส OTP ใหม่', v_rem);
                  cooldown_seconds := v_rem;
                  RETURN NEXT;
                  RETURN;
                END IF;
                IF v_diff_ms < p_window_ms THEN
                  IF v_global_row."requestCount" >= p_max_req THEN
                    outcome := 'RATE_LIMITED';
                    err_message := 'คุณขอรหัส OTP เกินจำนวนที่กำหนด (สูงสุด 5 ครั้งใน 15 นาที)';
                    cooldown_seconds := NULL;
                    RETURN NEXT;
                    RETURN;
                  END IF;
                  v_global_req := v_global_row."requestCount" + 1;
                END IF;
              END IF;

              SELECT "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil"
              INTO v_track_row
              FROM guest_otp_tracking WHERE key = v_track_key;
              IF FOUND THEN
                v_track_found := TRUE;
                v_fail_count := COALESCE(v_track_row."failCount", 0);
                v_last_fail := v_track_row."lastFailAt";
                v_blocked := v_track_row."blockedUntil";

                IF v_blocked IS NOT NULL AND v_blocked > p_now THEN
                  v_rem := CEIL(EXTRACT(EPOCH FROM (v_blocked - p_now)) / 60.0)::int;
                  outcome := 'BLOCKED';
                  err_message := format('ระบบระงับการตรวจสอบเนื่องจากใส่รหัสผิดเกินกำหนด กรุณารอ %s นาที', v_rem);
                  cooldown_seconds := NULL;
                  RETURN NEXT;
                  RETURN;
                END IF;

                IF v_last_fail IS NOT NULL AND ROUND(EXTRACT(EPOCH FROM (p_now - v_last_fail)) * 1000)::bigint > p_window_ms THEN
                  v_fail_count := 0;
                  v_last_fail := NULL;
                  v_blocked := NULL;
                END IF;

                v_diff_ms := ROUND(EXTRACT(EPOCH FROM (p_now - v_track_row."lastRequestAt")) * 1000)::bigint;
                IF v_diff_ms < p_resend_cooldown_ms THEN
                  v_rem := CEIL((p_resend_cooldown_ms - v_diff_ms)::numeric / 1000.0)::int;
                  outcome := 'COOLDOWN';
                  err_message := format('กรุณารอ %s วินาทีก่อนขอรหัส OTP ใหม่', v_rem);
                  cooldown_seconds := v_rem;
                  RETURN NEXT;
                  RETURN;
                END IF;

                IF v_diff_ms < p_window_ms THEN
                  IF v_track_row."requestCount" >= p_max_req THEN
                    outcome := 'RATE_LIMITED';
                    err_message := 'คุณขอรหัส OTP เกินจำนวนที่กำหนด (สูงสุด 5 ครั้งใน 15 นาที)';
                    cooldown_seconds := NULL;
                    RETURN NEXT;
                    RETURN;
                  END IF;
                  v_track_req := v_track_row."requestCount" + 1;
                END IF;
              END IF;

              IF v_track_found THEN
                UPDATE guest_otp_tracking
                SET "requestCount" = v_track_req, "lastRequestAt" = p_now, "failCount" = v_fail_count, "lastFailAt" = v_last_fail, "blockedUntil" = v_blocked
                WHERE key = v_track_key;
                UPDATE guest_otp SET "consumedAt" = p_now WHERE email = p_email AND purpose = p_purpose AND "consumedAt" IS NULL;
              ELSE
                INSERT INTO guest_otp_tracking (key, "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil")
                VALUES (v_track_key, 1, p_now, 0, NULL, NULL);
              END IF;

              IF v_global_found THEN
                UPDATE guest_otp_tracking SET "requestCount" = v_global_req, "lastRequestAt" = p_now WHERE key = v_global_key;
              ELSE
                INSERT INTO guest_otp_tracking (key, "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil")
                VALUES (v_global_key, 1, p_now, 0, NULL, NULL);
              END IF;

              IF p_ip_key IS NOT NULL THEN
                IF v_ip_found THEN
                  UPDATE guest_otp_tracking SET "requestCount" = v_ip_req, "lastRequestAt" = p_now WHERE key = p_ip_key;
                ELSE
                  INSERT INTO guest_otp_tracking (key, "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil")
                  VALUES (p_ip_key, 1, p_now, 0, NULL, NULL);
                END IF;
              END IF;

              INSERT INTO guest_otp (id, email, purpose, code, "requestId", "expiresAt", "consumedAt", "createdAt")
              VALUES (p_otp_id, p_email, p_purpose, p_hashed_code, p_request_id, p_otp_expires_at, NULL, p_now);

              outcome := 'OK';
              err_message := NULL;
              cooldown_seconds := NULL;
              RETURN NEXT;
              RETURN;
            END;
            $$;

            CREATE OR REPLACE FUNCTION verify_guest_otp_atomic_v1(
              p_email TEXT,
              p_purpose TEXT,
              p_request_id TEXT,
              p_submitted_code TEXT,
              p_expected_hash TEXT,
              p_now TIMESTAMPTZ,
              p_window_ms BIGINT,
              p_lockout_ms BIGINT,
              p_max_fails INT,
              p_cleared_cooldown_at TIMESTAMPTZ,
              p_verified_token TEXT,
              p_buyer_name TEXT,
              p_buyer_phone TEXT,
              p_session_expires_at TIMESTAMPTZ
            )
            RETURNS TABLE(outcome TEXT, err_message TEXT)
            LANGUAGE plpgsql
            VOLATILE
            AS $$
            DECLARE
              v_track_key TEXT := p_email || ':' || p_purpose;
              v_track RECORD;
              v_fail_count INT := 0;
              v_last_fail TIMESTAMPTZ := NULL;
              v_blocked TIMESTAMPTZ := NULL;
              v_otp RECORD;
              v_match BOOLEAN := FALSE;
              v_new_blocked TIMESTAMPTZ := NULL;
              v_rem INT;
            BEGIN
              SELECT "failCount", "lastFailAt", "blockedUntil"
              INTO v_track
              FROM guest_otp_tracking WHERE key = v_track_key FOR UPDATE;
              IF NOT FOUND THEN
                INSERT INTO guest_otp_tracking (key, "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil")
                VALUES (v_track_key, 0, p_now, 0, NULL, NULL)
                ON CONFLICT (key) DO NOTHING;
                SELECT "failCount", "lastFailAt", "blockedUntil"
                INTO v_track
                FROM guest_otp_tracking WHERE key = v_track_key FOR UPDATE;
              END IF;

              IF FOUND THEN
                v_fail_count := COALESCE(v_track."failCount", 0);
                v_last_fail := v_track."lastFailAt";
                v_blocked := v_track."blockedUntil";
                IF v_blocked IS NOT NULL AND v_blocked > p_now THEN
                  v_rem := CEIL(EXTRACT(EPOCH FROM (v_blocked - p_now)) / 60.0)::int;
                  outcome := 'BLOCKED';
                  err_message := format('ระบบระงับการตรวจสอบเนื่องจากใส่รหัสผิดเกิน 5 ครั้ง กรุณารอ %s นาที', v_rem);
                  RETURN NEXT;
                  RETURN;
                END IF;
                IF v_last_fail IS NOT NULL AND ROUND(EXTRACT(EPOCH FROM (p_now - v_last_fail)) * 1000)::bigint > p_window_ms THEN
                  v_fail_count := 0;
                  v_last_fail := NULL;
                  v_blocked := NULL;
                END IF;
              END IF;

              SELECT id, code, "expiresAt", "consumedAt"
              INTO v_otp
              FROM guest_otp
              WHERE "requestId" = p_request_id AND email = p_email AND purpose = p_purpose
              FOR UPDATE;
              IF NOT FOUND THEN
                outcome := 'NOT_FOUND';
                err_message := 'ไม่พบคำขอ OTP หรือข้อมูลไม่ตรงกับคำขอ';
                RETURN NEXT;
                RETURN;
              END IF;
              IF v_otp."consumedAt" IS NOT NULL THEN
                outcome := 'REPLAY';
                err_message := 'รหัส OTP นี้ถูกใช้งานไปแล้ว';
                RETURN NEXT;
                RETURN;
              END IF;
              IF p_now > v_otp."expiresAt" THEN
                outcome := 'EXPIRED';
                err_message := 'รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่';
                RETURN NEXT;
                RETURN;
              END IF;

              IF v_otp.code IS NOT NULL AND length(v_otp.code) = 64 THEN
                v_match := (v_otp.code = p_expected_hash);
              ELSE
                v_match := (v_otp.code = p_submitted_code);
              END IF;

              IF NOT v_match THEN
                v_fail_count := v_fail_count + 1;
                IF v_fail_count >= p_max_fails THEN
                  v_new_blocked := p_now + (p_lockout_ms * INTERVAL '1 millisecond');
                END IF;
                UPDATE guest_otp_tracking
                SET "failCount" = v_fail_count, "lastFailAt" = p_now, "blockedUntil" = v_new_blocked
                WHERE key = v_track_key;
                IF v_new_blocked IS NOT NULL THEN
                  outcome := 'BLOCKED';
                  err_message := 'คุณระบุรหัส OTP ผิดครบ 5 ครั้ง ระบบระงับการตรวจสอบเป็นเวลา 15 นาที';
                  RETURN NEXT;
                  RETURN;
                END IF;
                outcome := 'INVALID_CODE';
                err_message := format('รหัส OTP ไม่ถูกต้อง (เหลือโอกาสลองอีก %s ครั้ง)', p_max_fails - v_fail_count);
                RETURN NEXT;
                RETURN;
              END IF;

              UPDATE guest_otp SET "consumedAt" = p_now WHERE id = v_otp.id AND "consumedAt" IS NULL;
              IF NOT FOUND THEN
                outcome := 'REPLAY';
                err_message := 'รหัส OTP นี้ถูกใช้งานไปแล้ว';
                RETURN NEXT;
                RETURN;
              END IF;

              IF v_fail_count > 0 OR v_last_fail IS NOT NULL OR v_blocked IS NOT NULL THEN
                UPDATE guest_otp_tracking SET "failCount" = 0, "lastFailAt" = NULL, "blockedUntil" = NULL WHERE key = v_track_key;
              END IF;
              UPDATE guest_otp_tracking SET "lastRequestAt" = p_cleared_cooldown_at WHERE key = p_email || ':global';
              INSERT INTO guest_verified_sessions (token, email, name, phone, purpose, "verifiedAt", "expiresAt")
              VALUES (p_verified_token, p_email, p_buyer_name, p_buyer_phone, p_purpose, p_now, p_session_expires_at);

              outcome := 'OK';
              err_message := NULL;
              RETURN NEXT;
              RETURN;
            END;
            $$;
          `);
        });
      }
    } catch (err) {
      guestOtpSchemaPromises.delete(pool);
      throw err;
    }
  })();
  guestOtpSchemaPromises.set(pool, promise);
  return promise;
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
  const hasLiveSesCreds = Boolean(
    process.env.SES_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim(),
  );
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.VITEST &&
    hasLiveSesCreds &&
    isNonRoutableEmailAddress(email)
  ) {
    return { valid: false, error: 'กรุณาใช้อีเมลที่ใช้งานได้จริง ไม่สามารถใช้โดเมนสำหรับทดสอบได้' };
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
    clientIp?: string;
    now?: Date;
  },
): Promise<{
  success: boolean;
  requestId?: string;
  cooldownSeconds?: number;
  expiresInSeconds?: number;
  devOtpCode?: string;
  error?: string;
  code?: 'MISSING_FIELDS' | 'COOLDOWN' | 'RATE_LIMITED' | 'BLOCKED';
}> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const rawPurpose = input.purpose?.trim() || 'checkout';
  if (!ALLOWED_OTP_PURPOSES.includes(rawPurpose as OtpPurpose)) {
    return {
      success: false,
      error: 'วัตถุประสงค์ (purpose) ในการขอรหัส OTP ไม่ถูกต้อง',
      code: 'MISSING_FIELDS',
    };
  }
  const purpose: OtpPurpose = rawPurpose as OtpPurpose;

  const validation = validateBuyerDetails(input.buyer);
  if (!validation.valid || !validation.data) {
    return { success: false, error: validation.error, code: 'MISSING_FIELDS' };
  }

  const { email, name } = validation.data;
  await ensureGuestOtpSchema(pool);

  type RequestOtpTxResult =
    | { success: true; requestId: string; otpCode: string }
    | {
        success: false;
        error: string;
        cooldownSeconds?: number;
        code: 'MISSING_FIELDS' | 'COOLDOWN' | 'RATE_LIMITED' | 'BLOCKED';
      };

  const rawIp = input.clientIp?.trim().toLowerCase();
  const ipTrackKey = rawIp ? `ip:${rawIp}` : null;
  const globalTrackKey = `${email}:global`;
  const trackKey = `${email}:${purpose}`;

  let txResult: RequestOtpTxResult;
  if (isRealPgPool(pool)) {
    const otpCode = randomInt(100000, 1000000).toString();
    const requestId = randomUUID();
    const expiresAt = new Date(nowMs + OTP_EXPIRATION_SECONDS * 1000);
    const hashedCode = hashOtpCode(otpCode, requestId);

    const atomicRes = await pool.query<{ outcome: string; err_message: string | null; cooldown_seconds: number | null }>(
      `SELECT outcome, err_message, cooldown_seconds
       FROM request_guest_otp_atomic_v1($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        email,
        purpose,
        ipTrackKey,
        now,
        randomUUID(),
        hashedCode,
        requestId,
        expiresAt,
        OTP_RESEND_COOLDOWN_SECONDS * 1000,
        OTP_WINDOW_SECONDS * 1000,
        OTP_IP_WINDOW_SECONDS * 1000,
        OTP_MAX_REQUESTS_IN_WINDOW,
        OTP_IP_MAX_REQUESTS_IN_WINDOW,
      ],
    );
    const row = atomicRes.rows[0];
    if (row?.outcome === 'OK') {
      txResult = { success: true, requestId, otpCode };
    } else {
      txResult = {
        success: false,
        error: row?.err_message || 'เกิดข้อผิดพลาดในการส่งรหัส OTP',
        ...(row?.cooldown_seconds != null ? { cooldownSeconds: row.cooldown_seconds } : {}),
        code: (row?.outcome as 'COOLDOWN' | 'RATE_LIMITED' | 'BLOCKED') || 'RATE_LIMITED',
      };
    }
  } else {
    txResult = await inTransaction<RequestOtpTxResult>(pool, async client => {
      // 0. IP-level rate limiting (Issue #16): prevents mass spamming across different emails from single IP
      let ipRequestCount = 0;
      let ipTrackRes: { rowCount?: number | null; rows: Array<{ requestCount: number; lastRequestAt: Date }> } | null = null;

    if (ipTrackKey) {
      ipTrackRes = await client.query(
        'SELECT "requestCount", "lastRequestAt" FROM guest_otp_tracking WHERE key = $1 FOR UPDATE',
        [ipTrackKey],
      );

      if (ipTrackRes.rowCount && ipTrackRes.rowCount > 0) {
        const ipRow = ipTrackRes.rows[0];
        const ipLastRequestAt = new Date(ipRow.lastRequestAt);
        const ipDiffMs = nowMs - ipLastRequestAt.getTime();

        if (ipDiffMs < OTP_IP_WINDOW_SECONDS * 1000) {
          if (ipRow.requestCount >= OTP_IP_MAX_REQUESTS_IN_WINDOW) {
            return {
              success: false,
              error: 'คำขอรหัส OTP จาก IP ของท่านถี่เกินกำหนด กรุณารอสักครู่ (สูงสุด 20 ครั้งใน 15 นาที)',
              code: 'RATE_LIMITED',
            };
          }
          ipRequestCount = ipRow.requestCount + 1;
        } else {
          ipRequestCount = 1;
        }
      } else {
        ipRequestCount = 1;
      }
    }

    const trackRes = await client.query(
      'SELECT "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil" FROM guest_otp_tracking WHERE key = $1 FOR UPDATE',
      [trackKey],
    );

    // 1. Global Email-level rate limit & cooldown checks (Issue #6: anti-purpose switching bypass)
    const globalTrackRes = await client.query(
      'SELECT "requestCount", "lastRequestAt" FROM guest_otp_tracking WHERE key = $1 FOR UPDATE',
      [globalTrackKey],
    );

    let globalRequestCount = 0;
    if (globalTrackRes.rowCount && globalTrackRes.rowCount > 0) {
      const gRow = globalTrackRes.rows[0];
      const gLastRequestAt = new Date(gRow.lastRequestAt);
      const gDiffMs = nowMs - gLastRequestAt.getTime();

      // Cooldown across any OTP request for this email
      if (gDiffMs < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
        const remainingSec = Math.ceil((OTP_RESEND_COOLDOWN_SECONDS * 1000 - gDiffMs) / 1000);
        return {
          success: false,
          error: `กรุณารอ ${remainingSec} วินาทีก่อนขอรหัส OTP ใหม่`,
          cooldownSeconds: remainingSec,
          code: 'COOLDOWN',
        };
      }

      // 15-minute global ceiling for this email across all purposes
      if (gDiffMs < OTP_WINDOW_SECONDS * 1000) {
        if (gRow.requestCount >= OTP_MAX_REQUESTS_IN_WINDOW) {
          return {
            success: false,
            error: 'คุณขอรหัส OTP เกินจำนวนที่กำหนด (สูงสุด 5 ครั้งใน 15 นาที)',
            code: 'RATE_LIMITED',
          };
        }
        globalRequestCount = gRow.requestCount + 1;
      } else {
        globalRequestCount = 1;
      }
    } else {
      globalRequestCount = 1;
    }

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

    // Persist global email tracking
    if (globalTrackRes.rowCount && globalTrackRes.rowCount > 0) {
      await client.query(
        `UPDATE guest_otp_tracking
         SET "requestCount" = $1, "lastRequestAt" = $2
         WHERE key = $3`,
        [globalRequestCount, now, globalTrackKey],
      );
    } else {
      await client.query(
        `INSERT INTO guest_otp_tracking (key, "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil")
         VALUES ($1, 1, $2, 0, NULL, NULL)`,
        [globalTrackKey, now],
      );
    }

    // Persist IP-level tracking (Issue #16)
    if (ipTrackKey) {
      if (ipTrackRes?.rowCount && ipTrackRes.rowCount > 0) {
        await client.query(
          `UPDATE guest_otp_tracking
           SET "requestCount" = $1, "lastRequestAt" = $2
           WHERE key = $3`,
          [ipRequestCount, now, ipTrackKey],
        );
      } else {
        await client.query(
          `INSERT INTO guest_otp_tracking (key, "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil")
           VALUES ($1, 1, $2, 0, NULL, NULL)`,
          [ipTrackKey, now],
        );
      }
    }

    // AC-58: New OTP invalidates previous active OTPs for this email and purpose
    if (trackRes.rowCount && trackRes.rowCount > 0) {
      await client.query(
        `UPDATE guest_otp SET "consumedAt" = $1 WHERE email = $2 AND purpose = $3 AND "consumedAt" IS NULL`,
        [now, email, purpose],
      );
    }

    // Generate 6-digit random code (100000 to 999999)
    const otpCode = randomInt(100000, 1000000).toString();
    const requestId = randomUUID();
    const expiresAt = new Date(nowMs + OTP_EXPIRATION_SECONDS * 1000);
    // Issue #16: Hash OTP code using HMAC-SHA256 with unique requestId salt before storing
    const hashedCode = hashOtpCode(otpCode, requestId);

    await client.query(
      `INSERT INTO guest_otp (id, email, purpose, code, "requestId", "expiresAt", "consumedAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)`,
      [randomUUID(), email, purpose, hashedCode, requestId, expiresAt, now],
    );

      return {
        success: true as const,
        requestId,
        otpCode,
      };
    });
  }

  if (!txResult.success) {
    return txResult;
  }

  const { requestId, otpCode } = txResult;

  // Send email outside database transaction so external transport latency never holds a DB connection
  const isLookup = purpose === 'order_lookup';
  const emailSubject = isLookup
    ? `รหัส OTP สำหรับค้นหาบัตร TICKET: ${otpCode}`
    : `รหัส OTP สำหรับการซื้อบัตร TICKET: ${otpCode}`;
  const actionTitle = isLookup ? 'ค้นหาและเปิดดูบัตร TICKET' : 'ยืนยันตัวตนสำหรับการซื้อบัตร TICKET';
  const actionDesc = isLookup ? 'ค้นหาบัตรคอนเสิร์ต' : 'ยืนยันการซื้อบัตร';

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[LOCAL DEV OTP] Email: ${email} | Code: ${otpCode} | Purpose: ${purpose}`);
  }

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
    ...(process.env.NODE_ENV !== 'production' ? { devOtpCode: otpCode } : {}),
  };
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
  const rawPurpose = input.purpose?.trim() || 'checkout';
  if (!ALLOWED_OTP_PURPOSES.includes(rawPurpose as OtpPurpose)) {
    return {
      success: false,
      error: 'วัตถุประสงค์ (purpose) ในการตรวจสอบรหัส OTP ไม่ถูกต้อง',
      code: 'INVALID_CODE',
    };
  }
  const purpose: OtpPurpose = rawPurpose as OtpPurpose;
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

  if (isRealPgPool(pool)) {
    const expectedHash = hashOtpCode(submittedCode, requestId);
    const verifiedToken = randomUUID();
    const sessionExpiresAt = new Date(nowMs + VERIFIED_SESSION_EXPIRATION_SECONDS * 1000);
    const clearedCooldownAt = new Date(nowMs - (OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000);

    const atomicRes = await pool.query<{ outcome: string; err_message: string | null }>(
      `SELECT outcome, err_message
       FROM verify_guest_otp_atomic_v1($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        email,
        purpose,
        requestId,
        submittedCode,
        expectedHash,
        now,
        OTP_WINDOW_SECONDS * 1000,
        OTP_LOCKOUT_SECONDS * 1000,
        OTP_MAX_FAILS_IN_WINDOW,
        clearedCooldownAt,
        verifiedToken,
        buyerData.name,
        buyerData.phone,
        sessionExpiresAt,
      ],
    );
    const row = atomicRes.rows[0];
    if (row?.outcome === 'OK') {
      return {
        success: true,
        verifiedToken,
        buyer: buyerData,
      };
    }
    return {
      success: false,
      error: row?.err_message || 'เกิดข้อผิดพลาดในการยืนยัน OTP',
      code: (row?.outcome as 'INVALID_CODE' | 'EXPIRED' | 'REPLAY' | 'BLOCKED' | 'NOT_FOUND') || 'INVALID_CODE',
    };
  }

  return inTransaction(pool, async client => {
    const trackKey = `${email}:${purpose}`;
    let trackRes = await client.query(
      'SELECT "failCount", "lastFailAt", "blockedUntil" FROM guest_otp_tracking WHERE key = $1 FOR UPDATE',
      [trackKey],
    );

    if (!trackRes.rowCount || trackRes.rowCount === 0) {
      await client.query(
        `INSERT INTO guest_otp_tracking (key, "requestCount", "lastRequestAt", "failCount", "lastFailAt", "blockedUntil")
         VALUES ($1, 0, $2, 0, NULL, NULL)
         ON CONFLICT (key) DO NOTHING`,
        [trackKey, now],
      );
      trackRes = await client.query(
        'SELECT "failCount", "lastFailAt", "blockedUntil" FROM guest_otp_tracking WHERE key = $1 FOR UPDATE',
        [trackKey],
      );
    }

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

    // Look up OTP record by requestId, email, and purpose with row lock (AC-57: scope bound & serialized)
    const otpRes = await client.query(
      `SELECT id, code, "expiresAt", "consumedAt" FROM guest_otp
       WHERE "requestId" = $1 AND email = $2 AND purpose = $3 FOR UPDATE`,
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

    // Code match check with timing-safe comparison (Issue #16)
    let isCodeMatch = false;
    if (otpRow.code && otpRow.code.length === 64) {
      const expectedHash = hashOtpCode(submittedCode, requestId);
      const storedBuf = Buffer.from(otpRow.code, 'hex');
      const expectedBuf = Buffer.from(expectedHash, 'hex');
      isCodeMatch = storedBuf.length === expectedBuf.length && timingSafeEqual(storedBuf, expectedBuf);
    } else {
      // Fallback for legacy plaintext codes
      isCodeMatch = otpRow.code === submittedCode;
    }

    if (!isCodeMatch) {
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

    // AC-57: Mark OTP as consumed (one-time use) atomically
    const consumeRes = await client.query(
      `UPDATE guest_otp SET "consumedAt" = $1 WHERE id = $2 AND "consumedAt" IS NULL`,
      [now, otpRow.id],
    );

    if (consumeRes.rowCount === 0) {
      return { success: false, error: 'รหัส OTP นี้ถูกใช้งานไปแล้ว', code: 'REPLAY' };
    }

    // Reset fail count on successful verification and clear global cooldown so verified user can immediately perform order lookup
    if (failCount > 0 || lastFailAt !== null || blockedUntil !== null) {
      await client.query(
        `UPDATE guest_otp_tracking SET "failCount" = 0, "lastFailAt" = NULL, "blockedUntil" = NULL WHERE key = $1`,
        [trackKey],
      );
    }
    await client.query(
      `UPDATE guest_otp_tracking SET "lastRequestAt" = $1 WHERE key = $2`,
      [new Date(nowMs - (OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000), `${email}:global`],
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
  expectedPurpose?: OtpPurpose | readonly OtpPurpose[],
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

  if (expectedPurpose) {
    const allowed = Array.isArray(expectedPurpose) ? expectedPurpose : [expectedPurpose];
    if (!allowed.includes(row.purpose as OtpPurpose)) {
      return null;
    }
  }

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
