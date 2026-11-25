import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { inTransaction } from './database.ts';
import { emailTransport } from './email.ts';
import { readScenarioEmailTemplate, interpolateEmailVariables } from './email-master-template.ts';
import { minimumPasswordLength, maximumPasswordLength } from '../lib/bootstrap-input.ts';

// ADR-0004:
// - Organizer invitation: ลิงก์สุ่มใช้ครั้งเดียว อายุ 48 ชั่วโมง คำเชิญใหม่แทนที่ลิงก์เก่าของคำเชิญเดียวกัน
// - โค้ด/ลิงก์ต้องสุ่มอย่างปลอดภัย เก็บในรูปที่ไม่เปิดเผยค่าลับ (Hash)
export const INVITATION_EXPIRATION_HOURS = 48;
export const INVITATION_EXPIRATION_SECONDS = INVITATION_EXPIRATION_HOURS * 60 * 60; // 172800 seconds

export class InvitationSecurityError extends Error {
  readonly status: 400 | 401 | 403;

  constructor(message: string, status: 400 | 401 | 403) {
    super(message);
    this.name = 'InvitationSecurityError';
    this.status = status;
  }
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type InvitationRecord = {
  id: string;
  email: string;
  token: string;
  role?: 'organizer' | 'owner';
  status: 'pending' | 'accepted' | 'replaced' | 'expired';
  expiresAt: Date;
  createdAt: Date;
  acceptedAt?: Date | null;
};

const invitationSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureInvitationSchema(pool: Pool): Promise<void> {
  const existing = invitationSchemaPromises.get(pool);
  if (existing) {
    return existing;
  }
  const promise = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS organizer_invitations (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL DEFAULT 'organizer',
          status TEXT NOT NULL,
          "expiresAt" TIMESTAMPTZ NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "acceptedAt" TIMESTAMPTZ
        );
        ALTER TABLE organizer_invitations ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'organizer';
        CREATE INDEX IF NOT EXISTS idx_organizer_invitations_email ON organizer_invitations(email);
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'organizer_invitations'
              AND column_name = 'token'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'organizer_invitations'
              AND column_name = 'token_hash'
          ) THEN
            ALTER TABLE organizer_invitations RENAME COLUMN token TO token_hash;
          END IF;
        END $$;
        CREATE INDEX IF NOT EXISTS idx_organizer_invitations_token_hash ON organizer_invitations(token_hash);

        CREATE TABLE IF NOT EXISTS invitation_audit_logs (
          id TEXT PRIMARY KEY,
          "invitationId" TEXT NOT NULL,
          "invitedEmail" TEXT NOT NULL,
          "invitedRole" TEXT NOT NULL,
          "issuedByUserId" TEXT NOT NULL,
          "issuedByName" TEXT,
          "issuedByEmail" TEXT,
          "ipAddress" TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_invitation_audit_invitation ON invitation_audit_logs("invitationId");
        CREATE INDEX IF NOT EXISTS idx_invitation_audit_issued_by ON invitation_audit_logs("issuedByUserId");
      `);
    } catch (err) {
      invitationSchemaPromises.delete(pool);
      throw err;
    }
  })();
  invitationSchemaPromises.set(pool, promise);
  return promise;
}

export async function recordInvitationAuditLog(
  pool: Pool,
  data: {
    invitationId: string;
    invitedEmail: string;
    invitedRole: 'organizer' | 'owner';
    issuedByUserId: string;
    issuedByName?: string | null;
    issuedByEmail?: string | null;
    ipAddress?: string | null;
    now?: Date;
  },
): Promise<void> {
  await ensureInvitationSchema(pool);
  const id = `AUDIT-${randomUUID()}`;
  await pool.query(
    `INSERT INTO invitation_audit_logs (
      id, "invitationId", "invitedEmail", "invitedRole", "issuedByUserId", "issuedByName", "issuedByEmail", "ipAddress", "createdAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.invitationId,
      data.invitedEmail,
      data.invitedRole,
      data.issuedByUserId,
      data.issuedByName || null,
      data.issuedByEmail || null,
      data.ipAddress || null,
      data.now || new Date(),
    ],
  );
}

export async function createOrganizerInvitation(
  pool: Pool,
  email: string,
  baseURL: string,
  now = new Date(),
  invitedRole: 'organizer' | 'owner' = 'organizer',
  issuer?: {
    userId: string;
    name?: string | null;
    email?: string | null;
    ipAddress?: string | null;
    confirmPassword?: string;
  },
): Promise<{ id: string; token: string; email: string; role: 'organizer' | 'owner' }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('อีเมลไม่ถูกต้อง');
  }

  await ensureInvitationSchema(pool);

  if (!issuer?.userId) {
    throw new InvitationSecurityError('ไม่พบข้อมูลผู้เชิญ', 401);
  }
  if (invitedRole === 'owner') {
    if (!issuer.confirmPassword) {
      throw new InvitationSecurityError('กรุณาระบุรหัสผ่านปัจจุบันของคุณเพื่อยืนยันการเชิญผู้ดูแลระบบ (Owner)', 400);
    }
    const account = await pool.query<{ password: string | null }>(
      'SELECT password FROM auth_account WHERE "userId" = $1 AND "providerId" = $2',
      [issuer.userId, 'credential'],
    );
    if (!account.rowCount || !account.rows[0]?.password) {
      throw new InvitationSecurityError('ไม่พบบัญชีผู้ใช้', 401);
    }
    const passwordMatches = await verifyPassword({ hash: account.rows[0].password, password: issuer.confirmPassword });
    if (!passwordMatches) {
      throw new InvitationSecurityError('รหัสผ่านยืนยันไม่ถูกต้อง', 403);
    }
  }

  return inTransaction(pool, async client => {
    // Check if user already exists
    const existingUser = await client.query('SELECT id, role FROM auth_user WHERE email = $1', [normalizedEmail]);
    if (existingUser.rowCount && existingUser.rowCount > 0) {
      throw new Error('อีเมลนี้มีบัญชีในระบบอยู่แล้ว');
    }

    // Reissue: any existing pending invitation for this email is marked as 'replaced'
    await client.query(
      `UPDATE organizer_invitations 
       SET status = 'replaced' 
       WHERE email = $1 AND status = 'pending'`,
      [normalizedEmail],
    );

    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date(now.getTime() + INVITATION_EXPIRATION_SECONDS * 1000);

    await client.query(
      `INSERT INTO organizer_invitations (id, email, token_hash, status, "expiresAt", "createdAt", role)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)`,
      [id, normalizedEmail, tokenHash, expiresAt, now, invitedRole],
    );

    await client.query(
      `INSERT INTO invitation_audit_logs (
        id, "invitationId", "invitedEmail", "invitedRole", "issuedByUserId", "issuedByName", "issuedByEmail", "ipAddress", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        `AUDIT-${randomUUID()}`,
        id,
        normalizedEmail,
        invitedRole,
        issuer.userId,
        issuer.name || null,
        issuer.email || null,
        issuer.ipAddress || null,
        now,
      ],
    );

    const inviteUrl = `${new URL(baseURL).origin}/accept-invitation?token=${token}`;
    const roleThai = invitedRole === 'owner' ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้จัดงาน (Organizer)';

    let subject = `คำเชิญเข้าร่วมเป็น${roleThai} TICKET`;
    let html = `
      <div style="font-family: sans-serif; padding: 24px; color: #0f172a; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="margin-top: 0; color: #0f172a;">คำเชิญเข้าร่วมเป็น ${roleThai}</h2>
        <p>คุณได้รับคำเชิญเข้าร่วมเป็น ${roleThai} ในระบบ TICKET</p>
        <div style="margin: 24px 0;">
          <a href="${inviteUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            ยอมรับคำเชิญและตั้งรหัสผ่าน
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px;">ลิงก์นี้มีอายุการใช้งาน 48 ชั่วโมง และใช้งานได้เพียงครั้งเดียว</p>
      </div>
    `;

    try {
      const template = await readScenarioEmailTemplate(pool, 'staff_invitation');
      const vars = {
        user_name: issuer.name || 'ทีมงาน',
        staff_role: roleThai,
        invite_link: inviteUrl,
        expire_hours: '48',
        invited_email: normalizedEmail,
      };
      if (template.subject) {
        subject = interpolateEmailVariables(template.subject, vars);
      }
      const greeting = template.greetingText
        ? interpolateEmailVariables(template.greetingText, vars)
        : `เรียนคุณ ${normalizedEmail},`;
      const bodyText = template.bodyText
        ? interpolateEmailVariables(template.bodyText, vars).replace(/\n/g, '<br/>')
        : `คุณได้รับคำเชิญเข้าร่วมเป็น ${roleThai} ในระบบ TICKET กรุณาคลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านภายใน 48 ชั่วโมง`;
      const footerNotes = template.footerNotes
        ? interpolateEmailVariables(template.footerNotes, vars).replace(/\n/g, '<br/>')
        : 'ลิงก์นี้มีอายุการใช้งาน 48 ชั่วโมง หากมีข้อสงสัยโปรดติดต่อผู้ดูแลระบบ';

      html = `
        <div style="font-family: sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
          <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; padding: 24px;">
            <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #0f172a;">${template.headerTitle || `คำเชิญเข้าร่วมเป็น ${roleThai}`}</h2>
            <p style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">${greeting}</p>
            <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 24px;">
              ${bodyText}
            </div>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${inviteUrl}" style="background-color: ${template.primaryButtonColor || '#0f172a'}; color: ${template.primaryButtonTextColor || '#ffffff'}; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
                ${template.primaryButtonText || 'ยอมรับคำเชิญและตั้งรหัสผ่าน'}
              </a>
            </div>
            <div style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 24px; line-height: 1.6;">
              ${footerNotes}
            </div>
          </div>
        </div>
      `;
    } catch {
      // Fallback to default html
    }

    await emailTransport.send({
      from: 'noreply@ticket.invalid',
      to: normalizedEmail,
      subject,
      text: `คุณได้รับคำเชิญเข้าร่วมเป็น${roleThai}ในระบบ TICKET กรุณาคลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านภายใน 48 ชั่วโมง:\n${inviteUrl}`,
      html,
    });

    return { id, token, email: normalizedEmail, role: invitedRole };
  });
}

export async function verifyInvitation(
  pool: Pool,
  token: string,
  now = new Date(),
): Promise<{ valid: boolean; email?: string; role?: 'organizer' | 'owner'; reason?: 'not_found' | 'expired' | 'used' | 'replaced' }> {
  if (!token) return { valid: false, reason: 'not_found' };
  await ensureInvitationSchema(pool);

  const tokenHash = hashInvitationToken(token);
  const res = await pool.query(
    'SELECT id, email, token_hash, status, "expiresAt", role FROM organizer_invitations WHERE token_hash = $1',
    [tokenHash],
  );

  if (res.rowCount === 0) {
    return { valid: false, reason: 'not_found' };
  }

  const row = res.rows[0];
  if (!safeEqualInvitationHash(row.token_hash, tokenHash)) {
    return { valid: false, reason: 'not_found' };
  }
  if (row.status === 'accepted') {
    return { valid: false, reason: 'used' };
  }
  if (row.status === 'replaced') {
    return { valid: false, reason: 'replaced' };
  }
  if (now.getTime() > new Date(row.expiresAt).getTime()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, email: row.email, role: (row.role as 'organizer' | 'owner') || 'organizer' };
}

function safeEqualInvitationHash(storedHash: unknown, providedHash: string): boolean {
  if (typeof storedHash !== 'string' || !/^[0-9a-f]{64}$/i.test(storedHash)) return false;
  const stored = Buffer.from(storedHash, 'hex');
  const provided = Buffer.from(providedHash, 'hex');
  return stored.length === 32 && provided.length === 32 && timingSafeEqual(stored, provided);
}

export async function acceptOrganizerInvitation(
  pool: Pool,
  token: string,
  input: { name: string; password: string },
  now = new Date(),
): Promise<{ id: string; role: 'organizer' | 'owner'; name: string; email: string }> {
  const name = input.name?.trim();
  if (!name) {
    throw new Error('กรุณาระบุชื่อ');
  }
  const password = input.password;
  if (!password || password.length < minimumPasswordLength || password.length > maximumPasswordLength) {
    throw new Error(`รหัสผ่านต้องมีความยาว ${minimumPasswordLength} ถึง ${maximumPasswordLength} ตัวอักษร`);
  }

  await ensureInvitationSchema(pool);

  return inTransaction(pool, async client => {
    // Lock invitation row
    const tokenHash = hashInvitationToken(token);
    const res = await client.query(
      `SELECT id, email, token_hash, status, "expiresAt", role
       FROM organizer_invitations 
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );

    if (res.rowCount === 0) {
      throw new Error('ไม่พบคำเชิญ');
    }

    const row = res.rows[0];
    if (!safeEqualInvitationHash(row.token_hash, tokenHash)) {
      throw new Error('ไม่พบคำเชิญ');
    }
    if (row.status === 'accepted') {
      throw new Error('คำเชิญนี้ถูกใช้งานไปแล้ว');
    }
    if (row.status === 'replaced') {
      throw new Error('คำเชิญนี้ถูกยกเลิกเนื่องจากมีการออกคำเชิญใหม่');
    }
    if (now.getTime() > new Date(row.expiresAt).getTime()) {
      throw new Error('คำเชิญนี้หมดอายุแล้ว');
    }

    // Check if user already exists
    const existingUser = await client.query('SELECT id FROM auth_user WHERE email = $1', [row.email]);
    if (existingUser.rowCount && existingUser.rowCount > 0) {
      throw new Error('อีเมลนี้มีบัญชีในระบบอยู่แล้ว');
    }

    const userId = randomUUID();
    const hashedPassword = await hashPassword(password);
    const assignedRole: 'organizer' | 'owner' = row.role === 'owner' ? 'owner' : 'organizer';

    // Create user with assigned role (organizer or owner)
    await client.query(
      `INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, $4, $5, $5)`,
      [userId, name, row.email, assignedRole, now],
    );

    // Create credential account
    await client.query(
      `INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $2, $3, $4, $4)`,
      [randomUUID(), userId, hashedPassword, now],
    );

    // Update invitation status
    await client.query(
      `UPDATE organizer_invitations
       SET status = 'accepted', "acceptedAt" = $2
       WHERE id = $1`,
      [row.id, now],
    );

    return { id: userId, role: assignedRole, name, email: row.email };
  });
}

export async function listOrganizerInvitations(
  pool: Pool,
  now = new Date(),
): Promise<
  Array<{
    id: string;
    email: string;
    role: 'organizer' | 'owner';
    status: 'pending' | 'accepted' | 'replaced' | 'expired';
    token?: string;
    expiresAt: string;
    createdAt: string;
    acceptedAt?: string | null;
  }>
> {
  await ensureInvitationSchema(pool);
  const result = await pool.query(
    `SELECT id, email, role, status, "expiresAt", "createdAt", "acceptedAt"
     FROM organizer_invitations
     ORDER BY "createdAt" DESC`,
  );

  return result.rows.map(row => {
    let effectiveStatus = row.status;
    if (effectiveStatus === 'pending' && now.getTime() > new Date(row.expiresAt).getTime()) {
      effectiveStatus = 'expired';
    }
    return {
      id: row.id,
      email: row.email,
      role: (row.role as 'organizer' | 'owner') || 'organizer',
      status: effectiveStatus,
      expiresAt: new Date(row.expiresAt).toISOString(),
      createdAt: new Date(row.createdAt).toISOString(),
      acceptedAt: row.acceptedAt ? new Date(row.acceptedAt).toISOString() : null,
    };
  });
}

export interface BackOfficeAccountRecord {
  id: string;
  name: string;
  email: string;
  role: 'organizer' | 'owner';
  status: 'active' | 'suspended';
  createdAt: string;
  lastLoginAt: string | null;
  activeConcertsCount: number;
  phone: string | null;
  notes: string | null;
}

export async function listBackOfficeAccounts(pool: Pool): Promise<{
  organizers: BackOfficeAccountRecord[];
  admins: BackOfficeAccountRecord[];
}> {
  let rows: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date | string;
    lastLoginAt?: Date | string | null;
    activeConcertsCount?: number | string | null;
  }> = [];

  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.role,
         u."createdAt",
         (SELECT MAX(s."createdAt") FROM auth_session s WHERE s."userId" = u.id) AS "lastLoginAt",
         (SELECT COUNT(*)::int FROM events e WHERE e."organizerId" = u.id AND e.status <> 'cancelled') AS "activeConcertsCount"
       FROM auth_user u
       WHERE u.role IN ('organizer', 'owner')
       ORDER BY u."createdAt" DESC`,
    );
    rows = result.rows;
  } catch {
    try {
      const fallback = await pool.query(
        `SELECT id, name, email, role, "createdAt"
         FROM auth_user
         WHERE role IN ('organizer', 'owner')
         ORDER BY "createdAt" DESC`,
      );
      rows = fallback.rows;
    } catch {
      rows = [];
    }
  }

  const organizers: BackOfficeAccountRecord[] = [];
  const admins: BackOfficeAccountRecord[] = [];

  for (const row of rows) {
    const role: 'organizer' | 'owner' = row.role === 'owner' ? 'owner' : 'organizer';
    const item: BackOfficeAccountRecord = {
      id: row.id,
      name: row.name || row.email,
      email: row.email,
      role,
      status: 'active',
      createdAt: new Date(row.createdAt).toISOString(),
      lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt).toISOString() : null,
      activeConcertsCount: Number(row.activeConcertsCount) || 0,
      phone: null,
      notes: null,
    };
    if (role === 'owner') {
      admins.push(item);
    } else {
      organizers.push(item);
    }
  }

  return { organizers, admins };
}
