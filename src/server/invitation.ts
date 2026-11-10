import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { inTransaction } from './database.ts';
import { emailTransport } from './email.ts';
import { minimumPasswordLength, maximumPasswordLength } from '../lib/bootstrap-input.ts';

// ADR-0004:
// - Organizer invitation: ลิงก์สุ่มใช้ครั้งเดียว อายุ 48 ชั่วโมง คำเชิญใหม่แทนที่ลิงก์เก่าของคำเชิญเดียวกัน
// - โค้ด/ลิงก์ต้องสุ่มอย่างปลอดภัย เก็บในรูปที่ไม่เปิดเผยค่าลับ (Hash)
export const INVITATION_EXPIRATION_HOURS = 48;
export const INVITATION_EXPIRATION_SECONDS = INVITATION_EXPIRATION_HOURS * 60 * 60; // 172800 seconds

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
          token TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL DEFAULT 'organizer',
          status TEXT NOT NULL,
          "expiresAt" TIMESTAMPTZ NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "acceptedAt" TIMESTAMPTZ
        );
        ALTER TABLE organizer_invitations ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'organizer';
        CREATE INDEX IF NOT EXISTS idx_organizer_invitations_email ON organizer_invitations(email);
        CREATE INDEX IF NOT EXISTS idx_organizer_invitations_token ON organizer_invitations(token);

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
): Promise<{ id: string; token: string; email: string; role: 'organizer' | 'owner' }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('อีเมลไม่ถูกต้อง');
  }

  await ensureInvitationSchema(pool);

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
      `INSERT INTO organizer_invitations (id, email, token, status, "expiresAt", "createdAt", role)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)`,
      [id, normalizedEmail, tokenHash, expiresAt, now, invitedRole],
    );

    const inviteUrl = `${new URL(baseURL).origin}/accept-invitation?token=${token}`;
    const roleThai = invitedRole === 'owner' ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้จัดงาน (Organizer)';
    await emailTransport.send({
      from: 'noreply@ticket.invalid',
      to: normalizedEmail,
      subject: `คำเชิญเข้าร่วมเป็น${roleThai} TICKET`,
      text: `คุณได้รับคำเชิญเข้าร่วมเป็น${roleThai}ในระบบ TICKET กรุณาคลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านภายใน 48 ชั่วโมง:\n${inviteUrl}`,
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
    'SELECT id, email, status, "expiresAt", role FROM organizer_invitations WHERE token = $1 OR token = $2',
    [tokenHash, token],
  );

  if (res.rowCount === 0) {
    return { valid: false, reason: 'not_found' };
  }

  const row = res.rows[0];
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
      `SELECT id, email, status, "expiresAt", role 
       FROM organizer_invitations 
       WHERE token = $1 OR token = $2 
       FOR UPDATE`,
      [tokenHash, token],
    );

    if (res.rowCount === 0) {
      throw new Error('ไม่พบคำเชิญ');
    }

    const row = res.rows[0];
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
