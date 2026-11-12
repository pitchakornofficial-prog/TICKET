import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { migrateAuth } from '../../src/server/auth-migration.ts';
import { bootstrapOwner } from '../../src/server/bootstrap-owner.ts';

if (process.env.CAPACITY_ISOLATED !== 'true') throw new Error('Isolation opt-in required');
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'SES_ACCESS_KEY_ID', 'SES_SECRET_ACCESS_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'RESEND_API_KEY', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
  if (process.env[key]) throw new Error(`Provider credential must be absent: ${key}`);
}
const database = process.env.CAPACITY_DATABASE;
if (!/^capacity_20261112_[a-f0-9]{8}$/.test(database || '')) throw new Error('Invalid test database name');
const source = new URL(process.env.STAGING_DATABASE_URL || '');
if (!source.hostname.endsWith('.neon.tech')) throw new Error('Expected staging Neon endpoint');
const direct = new URL(source); direct.hostname = direct.hostname.replace('-pooler.', '.');
const control = new Pool({ connectionString: direct.toString(), max: 1 });
// No DROP/UPDATE/DELETE of existing databases or tables. New database must not exist.
if ((await control.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) {
  throw new Error('Capacity database already exists; refusing to reuse it');
}
await control.query(`CREATE DATABASE "${database}"`);
await control.end();
source.pathname = `/${database}`; direct.pathname = `/${database}`;
process.env.DATABASE_URL = source.toString();
delete process.env.STAGING_DATABASE_URL;
const pool = new Pool({ connectionString: direct.toString(), max: 3 });
const identity = await pool.query('SELECT current_database() AS db');
if (identity.rows[0].db !== database) throw new Error('Database isolation failed');
await migrateAuth(pool);
const password = 'Capacity-only-fixture!20261112';
await bootstrapOwner(pool, { email: 'owner@capacity.invalid', name: 'Capacity owner', password });
const id = randomUUID(); const hash = await hashPassword(password);
await pool.query('INSERT INTO auth_user (id,name,email,"emailVerified",role,"createdAt","updatedAt") VALUES ($1,$2,$3,false,$4,now(),now())', [id, 'Capacity organizer', 'organizer@capacity.invalid', 'organizer']);
await pool.query('INSERT INTO auth_account (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES ($1,$2,$3,$2,$4,now(),now())', [randomUUID(), id, 'credential', hash]);
await pool.end();
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.BETTER_AUTH_URL = 'http://localhost:3000';
process.env.CAPACITY_PROVIDER_MODE = 'test';
process.env.ENABLE_PAY_TEST = 'true';
process.env.STRIPE_LIVE_MODE = 'false';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.HOSTNAME = '0.0.0.0'; process.env.PORT = '3000';
console.log(`CAPACITY_READY ${JSON.stringify({ database, poolMax: process.env.DATABASE_POOL_MAX, providers: 'doubles', publicIngress: false })}`);
const child = spawn(process.execPath, ['.next/standalone/server.js'], { stdio: 'inherit', env: process.env });
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGTERM'));
// Bound task lifetime even if the driver fails; keep test data for explicit review/cleanup.
const timeout = setTimeout(() => child.kill('SIGTERM'), 30 * 60 * 1000);
child.on('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1; });
