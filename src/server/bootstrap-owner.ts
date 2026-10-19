import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { Pool } from 'pg';
import { validateBootstrapInput } from '../lib/bootstrap-input.ts';
import { inTransaction } from './database.ts';

// Internal-only: never imported by a public route. One atomic user/account creation.
export async function bootstrapOwner(pool: Pool, value: unknown): Promise<{ id: string }> {
  const input = validateBootstrapInput(value);
  const password = await hashPassword(input.password);
  return inTransaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [945162002]);
    if ((await client.query('SELECT id FROM auth_user WHERE role=$1 LIMIT 1', ['owner'])).rowCount) {
      throw new Error('มีบัญชีเจ้าของเว็บแล้ว ไม่สร้างหรือเปลี่ยนรหัสผ่านซ้ำ');
    }
    const id = randomUUID();
    await client.query('INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1,$2,$3,false,$4,now(),now())', [id, input.name, input.email, 'owner']);
    await client.query('INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1,$2,$3,$2,$4,now(),now())', [randomUUID(), id, 'credential', password]);
    return { id };
  });
}
