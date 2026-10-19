import { randomUUID, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { createAuth } from '../../src/server/auth.ts';
import { migrateAuth } from '../../src/server/auth-migration.ts';
import { bootstrapOwner } from '../../src/server/bootstrap-owner.ts';
import { inTransaction } from '../../src/server/database.ts';
import { testDatabaseUrl } from './test-database.ts';
import type { Role } from '../../src/lib/back-office-access.ts';

export const fixturePassword = 'Fixture-only-password!002';
export const fixtureAccounts = {
  owner: { email: 'owner@ticket.invalid', name: 'เจ้าของเว็บทดสอบ' },
  organizer: { email: 'organizer@ticket.invalid', name: 'ผู้จัดงานทดสอบ' },
  scanner: { email: 'scanner@ticket.invalid', name: 'ทีมสแกนทดสอบ' },
};
export const resetAccounts = {
  owner: { email: 'reset-owner@ticket.invalid', name: 'เจ้าของเว็บรีเซ็ต' },
  organizer: { email: 'reset-organizer@ticket.invalid', name: 'ผู้จัดงานรีเซ็ต' },
  scanner: { email: 'reset-scanner@ticket.invalid', name: 'ทีมสแกนรีเซ็ต' },
};

export async function authFixture(prefix: 'integration' | 'e2e', baseURL = 'http://127.0.0.1:3100') {
  const databaseUrl = testDatabaseUrl();
  const schema = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  const control = new Pool({ connectionString: databaseUrl });
  await control.query(`CREATE SCHEMA "${schema}"`);
  const scopedUrl = new URL(databaseUrl);
  scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: scopedUrl.toString(), max: 5 });
  const settings = { baseURL, secret: randomBytes(32).toString('base64url') };
  async function cleanup() {
    try { await pool.end(); await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await control.end(); }
  }
  try {
    await migrateAuth(pool);
    const auth = createAuth(pool, settings);
    const owner = await bootstrapOwner(pool, { ...fixtureAccounts.owner, password: fixturePassword });
    const ids: Record<Role, string> = { owner: owner.id, organizer: '', scanner: '' };
    for (const role of ['organizer', 'scanner'] as const) {
      ids[role] = randomUUID();
      const account = fixtureAccounts[role];
      const password = await hashPassword(fixturePassword);
      await inTransaction(pool, async client => {
        await client.query('INSERT INTO auth_user (id,name,email,"emailVerified",role,"createdAt","updatedAt") VALUES ($1,$2,$3,false,$4,now(),now())', [ids[role], account.name, account.email, role]);
        await client.query('INSERT INTO auth_account (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES ($1,$2,$3,$2,$4,now(),now())', [randomUUID(), ids[role], 'credential', password]);
      });
    }
    if (prefix === 'e2e') {
      for (const role of ['owner', 'organizer', 'scanner'] as const) {
        const resetAcc = resetAccounts[role];
        const resetId = randomUUID();
        const password = await hashPassword(fixturePassword);
        await inTransaction(pool, async client => {
          await client.query('INSERT INTO auth_user (id,name,email,"emailVerified",role,"createdAt","updatedAt") VALUES ($1,$2,$3,false,$4,now(),now())', [resetId, resetAcc.name, resetAcc.email, role]);
          await client.query('INSERT INTO auth_account (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES ($1,$2,$3,$2,$4,now(),now())', [randomUUID(), resetId, 'credential', password]);
        });
      }
    }
    return { auth, pool, settings, databaseUrl: scopedUrl.toString(), ids, schema, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
