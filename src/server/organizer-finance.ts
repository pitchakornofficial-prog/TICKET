import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

export interface PayoutBankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  isPrimary: boolean;
  qrCodeUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePayoutAccountInput {
  accountName: string;
  accountNumber: string;
  bankName: string;
  isPrimary?: boolean;
  qrCodeUrl?: string;
}

export interface UpdatePayoutAccountInput {
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  isPrimary?: boolean;
  qrCodeUrl?: string;
}

export interface OrganizerProfileData {
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  primaryPhone: string;
  backupContactName: string;
  backupPhone: string;
  updatedAt?: string;
}

export interface UpdateOrganizerProfileInput {
  organizerName?: string;
  primaryPhone?: string;
  backupContactName?: string;
  backupPhone?: string;
}

export async function ensureOrganizerFinanceSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizer_payout_accounts (
        id TEXT PRIMARY KEY,
        "organizerId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
        "accountName" TEXT NOT NULL,
        "accountNumber" TEXT NOT NULL,
        "bankName" TEXT NOT NULL,
        "isPrimary" BOOLEAN NOT NULL DEFAULT false,
        "qrCodeUrl" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_organizer_payout_accounts_org ON organizer_payout_accounts("organizerId");

      CREATE TABLE IF NOT EXISTS organizer_profiles (
        "organizerId" TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
        "primaryPhone" TEXT,
        "backupContactName" TEXT,
        "backupPhone" TEXT,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  } finally {
    client.release();
  }
}

export async function getOrganizerPayoutAccounts(
  pool: Pool,
  organizerId: string,
): Promise<PayoutBankAccount[]> {
  await ensureOrganizerFinanceSchema(pool);

  const res = await pool.query<{
    id: string;
    accountName: string;
    accountNumber: string;
    bankName: string;
    isPrimary: boolean;
    qrCodeUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT id, "accountName", "accountNumber", "bankName", "isPrimary", "qrCodeUrl", "createdAt", "updatedAt"
     FROM organizer_payout_accounts
     WHERE "organizerId" = $1
     ORDER BY "isPrimary" DESC, "createdAt" ASC`,
    [organizerId],
  );

  if (res.rows.length > 0) {
    return res.rows.map((r) => ({
      id: r.id,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      bankName: r.bankName,
      isPrimary: r.isPrimary,
      qrCodeUrl: r.qrCodeUrl || undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  // Auto-migration: Check if existing events have a payout bank account
  const eventRes = await pool.query<{
    payoutBankName: string | null;
    payoutAccountNumber: string | null;
    payoutAccountName: string | null;
  }>(
    `SELECT "payoutBankName", "payoutAccountNumber", "payoutAccountName"
     FROM events
     WHERE "organizerId" = $1 AND "payoutAccountNumber" IS NOT NULL AND TRIM("payoutAccountNumber") <> ''
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [organizerId],
  );

  let initialAccount: PayoutBankAccount;
  if (eventRes.rows.length > 0 && eventRes.rows[0].payoutAccountNumber) {
    const row = eventRes.rows[0];
    const newId = `acc-${randomUUID().slice(0, 8)}`;
    const insRes = await pool.query<{
      id: string;
      accountName: string;
      accountNumber: string;
      bankName: string;
      isPrimary: boolean;
      qrCodeUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `INSERT INTO organizer_payout_accounts (id, "organizerId", "accountName", "accountNumber", "bankName", "isPrimary", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, now(), now())
       RETURNING id, "accountName", "accountNumber", "bankName", "isPrimary", "qrCodeUrl", "createdAt", "updatedAt"`,
      [
        newId,
        organizerId,
        row.payoutAccountName || 'บัญชีรับเงินผู้จัดงาน',
        row.payoutAccountNumber,
        row.payoutBankName || 'ธนาคารกสิกรไทย (KBANK)',
      ],
    );
    const r = insRes.rows[0];
    initialAccount = {
      id: r.id,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      bankName: r.bankName,
      isPrimary: r.isPrimary,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  } else {
    // Fallback: create default initial account using user's name from auth_user
    const userRes = await pool.query<{ name: string }>(
      'SELECT name FROM auth_user WHERE id = $1',
      [organizerId],
    );
    const orgName = userRes.rows[0]?.name || 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี';
    const newId = `acc-${randomUUID().slice(0, 8)}`;
    const insRes = await pool.query<{
      id: string;
      accountName: string;
      accountNumber: string;
      bankName: string;
      isPrimary: boolean;
      qrCodeUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `INSERT INTO organizer_payout_accounts (id, "organizerId", "accountName", "accountNumber", "bankName", "isPrimary", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, now(), now())
       RETURNING id, "accountName", "accountNumber", "bankName", "isPrimary", "qrCodeUrl", "createdAt", "updatedAt"`,
      [newId, organizerId, orgName, '123-4-56789-0', 'ธนาคารกสิกรไทย (KBANK)'],
    );
    const r = insRes.rows[0];
    initialAccount = {
      id: r.id,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      bankName: r.bankName,
      isPrimary: r.isPrimary,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  return [initialAccount];
}

export async function createOrganizerPayoutAccount(
  pool: Pool,
  organizerId: string,
  input: CreatePayoutAccountInput,
): Promise<PayoutBankAccount> {
  await ensureOrganizerFinanceSchema(pool);

  const accountName = (input.accountName || '').trim();
  const accountNumber = (input.accountNumber || '').trim();
  const bankName = (input.bankName || '').trim();

  if (!accountName || !accountNumber || !bankName) {
    throw new Error('กรุณากรอกข้อมูลบัญชีธนาคารให้ครบถ้วน (ชื่อบัญชี, เลขที่บัญชี, ชื่อธนาคาร)');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check count of accounts
    const countRes = await client.query<{ count: string }>(
      'SELECT count(*)::text as count FROM organizer_payout_accounts WHERE "organizerId" = $1',
      [organizerId],
    );
    const count = Number(countRes.rows[0]?.count || 0);

    const isPrimary = Boolean(input.isPrimary) || count === 0;

    if (isPrimary) {
      await client.query(
        'UPDATE organizer_payout_accounts SET "isPrimary" = false, "updatedAt" = now() WHERE "organizerId" = $1',
        [organizerId],
      );
    }

    const newId = `acc-${randomUUID().slice(0, 8)}`;
    const res = await client.query<{
      id: string;
      accountName: string;
      accountNumber: string;
      bankName: string;
      isPrimary: boolean;
      qrCodeUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `INSERT INTO organizer_payout_accounts (id, "organizerId", "accountName", "accountNumber", "bankName", "isPrimary", "qrCodeUrl", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
       RETURNING id, "accountName", "accountNumber", "bankName", "isPrimary", "qrCodeUrl", "createdAt", "updatedAt"`,
      [newId, organizerId, accountName, accountNumber, bankName, isPrimary, input.qrCodeUrl || null],
    );

    await client.query('COMMIT');

    const r = res.rows[0];
    return {
      id: r.id,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      bankName: r.bankName,
      isPrimary: r.isPrimary,
      qrCodeUrl: r.qrCodeUrl || undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateOrganizerPayoutAccount(
  pool: Pool,
  organizerId: string,
  accountId: string,
  input: UpdatePayoutAccountInput,
): Promise<PayoutBankAccount> {
  await ensureOrganizerFinanceSchema(pool);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existRes = await client.query<{ id: string; isPrimary: boolean }>(
      'SELECT id, "isPrimary" FROM organizer_payout_accounts WHERE id = $1 AND "organizerId" = $2',
      [accountId, organizerId],
    );
    if (existRes.rows.length === 0) {
      throw new Error('ไม่พบบัญชีธนาคารที่ต้องการแก้ไข');
    }

    if (input.isPrimary === true) {
      await client.query(
        'UPDATE organizer_payout_accounts SET "isPrimary" = false, "updatedAt" = now() WHERE "organizerId" = $1',
        [organizerId],
      );
    }

    const res = await client.query<{
      id: string;
      accountName: string;
      accountNumber: string;
      bankName: string;
      isPrimary: boolean;
      qrCodeUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `UPDATE organizer_payout_accounts
       SET "accountName" = COALESCE($3, "accountName"),
           "accountNumber" = COALESCE($4, "accountNumber"),
           "bankName" = COALESCE($5, "bankName"),
           "isPrimary" = COALESCE($6, "isPrimary"),
           "qrCodeUrl" = COALESCE($7, "qrCodeUrl"),
           "updatedAt" = now()
       WHERE id = $1 AND "organizerId" = $2
       RETURNING id, "accountName", "accountNumber", "bankName", "isPrimary", "qrCodeUrl", "createdAt", "updatedAt"`,
      [
        accountId,
        organizerId,
        input.accountName ? input.accountName.trim() : null,
        input.accountNumber ? input.accountNumber.trim() : null,
        input.bankName ? input.bankName.trim() : null,
        input.isPrimary !== undefined ? input.isPrimary : null,
        input.qrCodeUrl !== undefined ? input.qrCodeUrl : null,
      ],
    );

    await client.query('COMMIT');

    const r = res.rows[0];
    return {
      id: r.id,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      bankName: r.bankName,
      isPrimary: r.isPrimary,
      qrCodeUrl: r.qrCodeUrl || undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteOrganizerPayoutAccount(
  pool: Pool,
  organizerId: string,
  accountId: string,
): Promise<{ success: boolean; nextPrimaryId?: string }> {
  await ensureOrganizerFinanceSchema(pool);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Count accounts
    const countRes = await client.query<{ count: string }>(
      'SELECT count(*)::text as count FROM organizer_payout_accounts WHERE "organizerId" = $1',
      [organizerId],
    );
    const count = Number(countRes.rows[0]?.count || 0);

    if (count <= 1) {
      throw new Error('ต้องมีบัญชีรับเงินอย่างน้อย 1 บัญชีในระบบสำหรับรับเงินยอดขาย');
    }

    const targetRes = await client.query<{ isPrimary: boolean }>(
      'SELECT "isPrimary" FROM organizer_payout_accounts WHERE id = $1 AND "organizerId" = $2',
      [accountId, organizerId],
    );
    if (targetRes.rows.length === 0) {
      throw new Error('ไม่พบบัญชีธนาคารที่ต้องการลบ');
    }

    const wasPrimary = targetRes.rows[0].isPrimary;

    await client.query(
      'DELETE FROM organizer_payout_accounts WHERE id = $1 AND "organizerId" = $2',
      [accountId, organizerId],
    );

    let nextPrimaryId: string | undefined;
    if (wasPrimary) {
      const nextRes = await client.query<{ id: string }>(
        `UPDATE organizer_payout_accounts
         SET "isPrimary" = true, "updatedAt" = now()
         WHERE id = (
           SELECT id FROM organizer_payout_accounts
           WHERE "organizerId" = $1
           ORDER BY "createdAt" ASC
           LIMIT 1
         )
         RETURNING id`,
        [organizerId],
      );
      nextPrimaryId = nextRes.rows[0]?.id;
    }

    await client.query('COMMIT');
    return { success: true, nextPrimaryId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setPrimaryOrganizerPayoutAccount(
  pool: Pool,
  organizerId: string,
  accountId: string,
): Promise<PayoutBankAccount> {
  return updateOrganizerPayoutAccount(pool, organizerId, accountId, { isPrimary: true });
}

export async function getOrganizerProfile(
  pool: Pool,
  organizerId: string,
): Promise<OrganizerProfileData> {
  await ensureOrganizerFinanceSchema(pool);

  const userRes = await pool.query<{ name: string; email: string }>(
    'SELECT name, email FROM auth_user WHERE id = $1',
    [organizerId],
  );

  const orgName = userRes.rows[0]?.name || 'สมชาย ผู้จัดงาน';
  const orgEmail = userRes.rows[0]?.email || 'organizer@ticket.local';

  const profRes = await pool.query<{
    primaryPhone: string | null;
    backupContactName: string | null;
    backupPhone: string | null;
    updatedAt: Date;
  }>(
    'SELECT "primaryPhone", "backupContactName", "backupPhone", "updatedAt" FROM organizer_profiles WHERE "organizerId" = $1',
    [organizerId],
  );

  const prof = profRes.rows[0];
  return {
    organizerId,
    organizerName: orgName,
    organizerEmail: orgEmail,
    primaryPhone: prof?.primaryPhone || '081-234-5678',
    backupContactName: prof?.backupContactName || 'วิภาดา การเงิน',
    backupPhone: prof?.backupPhone || '089-876-5432',
    updatedAt: prof?.updatedAt?.toISOString(),
  };
}

export async function updateOrganizerProfile(
  pool: Pool,
  organizerId: string,
  input: UpdateOrganizerProfileInput,
): Promise<OrganizerProfileData> {
  await ensureOrganizerFinanceSchema(pool);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (input.organizerName?.trim()) {
      await client.query(
        'UPDATE auth_user SET name = $1, "updatedAt" = now() WHERE id = $2',
        [input.organizerName.trim(), organizerId],
      );
    }

    await client.query(
      `INSERT INTO organizer_profiles ("organizerId", "primaryPhone", "backupContactName", "backupPhone", "updatedAt")
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT ("organizerId")
       DO UPDATE SET
         "primaryPhone" = COALESCE($2, organizer_profiles."primaryPhone"),
         "backupContactName" = COALESCE($3, organizer_profiles."backupContactName"),
         "backupPhone" = COALESCE($4, organizer_profiles."backupPhone"),
         "updatedAt" = now()`,
      [
        organizerId,
        input.primaryPhone !== undefined ? input.primaryPhone.trim() : null,
        input.backupContactName !== undefined ? input.backupContactName.trim() : null,
        input.backupPhone !== undefined ? input.backupPhone.trim() : null,
      ],
    );

    await client.query('COMMIT');
    return getOrganizerProfile(pool, organizerId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
