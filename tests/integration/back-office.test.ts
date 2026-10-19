import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth, readActor } from '../../src/server/auth';
import { handleAuthRequest } from '../../src/server/auth-http';
import { bootstrapOwner } from '../../src/server/bootstrap-owner';
import { migrateAuth } from '../../src/server/auth-migration';
import { roleAccess } from '../../src/lib/back-office-access';
import { authFixture, fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { testDatabaseUrl } from '../support/test-database';

describe('internal owner bootstrap and PostgreSQL-backed role sessions', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';
  let nextIp = 1;
  function request(path: string, body?: unknown, cookie?: string, origin = baseURL) {
    return new Request(`${baseURL}/api/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': `192.0.2.${nextIp++}`, ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  function cookieFrom(response: Response) { return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; '); }
  beforeAll(async () => { fixture = await authFixture('integration', baseURL); }, 30000);
  afterAll(async () => { if (fixture) await fixture.cleanup(); });

  it('creates only the first owner internally, never overwrites its password, and can repeat migration safely', async () => {
    await migrateAuth(fixture.pool);
    const owner = await fixture.pool.query('SELECT id,role FROM auth_user WHERE role=$1', ['owner']);
    expect(owner.rows).toEqual([{ id: fixture.ids.owner, role: 'owner' }]);
    const stored = await fixture.pool.query('SELECT password FROM auth_account WHERE "userId"=$1', [fixture.ids.owner]);
    expect(stored.rows[0].password).not.toBe(fixturePassword);
    const attempts = await Promise.allSettled([1, 2].map(n => bootstrapOwner(fixture.pool, { name: 'repeat', email: `repeat${n}@ticket.invalid`, password: 'Another fixture password!' })));
    expect(attempts.every(result => result.status === 'rejected')).toBe(true);
    expect((await fixture.pool.query('SELECT password FROM auth_account WHERE "userId"=$1', [fixture.ids.owner])).rows).toEqual(stored.rows);
    expect((await fixture.pool.query('SELECT id FROM auth_user WHERE role=$1', ['owner'])).rowCount).toBe(1);
  });

  async function emptyAuthStore() {
    const control = new Pool({ connectionString: testDatabaseUrl() });
    const schema = `integration_${randomUUID().replaceAll('-', '')}`;
    await control.query(`CREATE SCHEMA "${schema}"`);
    const url = new URL(testDatabaseUrl());
    url.searchParams.set('options', `-c search_path=${schema}`);
    const first = new Pool({ connectionString: url.toString(), max: 2 });
    const second = new Pool({ connectionString: url.toString(), max: 2 });
    async function cleanup() {
      try {
        await Promise.all([first.end(), second.end()]);
        await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally { await control.end(); }
    }
    try { await migrateAuth(first); }
    catch (error) { await cleanup(); throw error; }
    return { first, second, databaseUrl: url.toString(), cleanup };
  }

  it('two independent setup clients competing for an empty store create exactly one usable first owner', async () => {
    const store = await emptyAuthStore();
    try {
      const attempts = await Promise.allSettled([
        bootstrapOwner(store.first, { name: 'First contender', email: 'first@ticket.invalid', password: fixturePassword }),
        bootstrapOwner(store.second, { name: 'Second contender', email: 'second@ticket.invalid', password: fixturePassword }),
      ]);
      expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
      const users = await store.second.query('SELECT id,email,role FROM auth_user');
      expect(users.rowCount).toBe(1);
      expect(users.rows[0].role).toBe('owner');
      expect((await store.second.query('SELECT "userId" FROM auth_account')).rows)
        .toEqual([{ userId: users.rows[0].id }]);
      const auth = createAuth(store.second, fixture.settings);
      const login = await handleAuthRequest(auth, request('sign-in/email', { email: users.rows[0].email, password: fixturePassword }));
      expect(login.status).toBe(200);
      expect(await readActor(auth, new Headers({ Cookie: cookieFrom(login) })))
        .toMatchObject({ id: users.rows[0].id, role: 'owner' });
      // Another schema already has an owner: neither setup leaked across schemas.
      expect((await fixture.pool.query('SELECT id FROM auth_user WHERE role=$1', ['owner'])).rows)
        .toEqual([{ id: fixture.ids.owner }]);
    } finally { await store.cleanup(); }
  }, 30000);

  it('the internal CLI consumes stdin, succeeds only once, and never prints credentials', async () => {
    const store = await emptyAuthStore();
    const input = { name: 'CLI owner', email: 'cli-owner@ticket.invalid', password: fixturePassword };
    function runSetup(value: typeof input) {
      return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/bootstrap-owner.ts'], {
          env: { DATABASE_URL: store.databaseUrl, NODE_ENV: 'test' }, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
        });
        let stdout = ''; let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('close', code => resolve({ code, stdout, stderr }));
        child.stdin.end(JSON.stringify(value));
      });
    }
    try {
      const success = await runSetup(input);
      expect(success.code).toBe(0);
      expect(success.stdout).toContain('สร้างบัญชีเจ้าของเว็บแล้ว');
      const repeated = await runSetup({ ...input, password: 'A different fixture password!' });
      expect(repeated.code).toBe(1);
      expect(repeated.stderr).toContain('สร้างบัญชีไม่ได้');
      for (const result of [success, repeated]) {
        expect(result.stdout + result.stderr).not.toContain(input.email);
        expect(result.stdout + result.stderr).not.toContain(input.password);
        expect(result.stdout + result.stderr).not.toContain('A different fixture password!');
      }
      const users = await store.second.query('SELECT id,role FROM auth_user');
      expect(users.rowCount).toBe(1);
      const auth = createAuth(store.second, fixture.settings);
      const login = await handleAuthRequest(auth, request('sign-in/email', { email: input.email, password: input.password }));
      expect(login.status).toBe(200);
      expect(await readActor(auth, new Headers({ Cookie: cookieFrom(login) })))
        .toMatchObject({ id: users.rows[0].id, role: 'owner' });
    } finally { await store.cleanup(); }
  }, 30000);

  it('a failed credential insert rolls back the owner and permits a later internal setup', async () => {
    const store = await emptyAuthStore();
    const input = { name: 'Retry setup', email: 'retry@ticket.invalid', password: fixturePassword };
    try {
      // Force a real SQL boundary failure after auth_user is inserted.
      await store.first.query('ALTER TABLE auth_account ADD CONSTRAINT reject_test_credentials CHECK (false)');
      await expect(bootstrapOwner(store.first, input)).rejects.toMatchObject({ code: '23514' });
      expect((await store.second.query('SELECT id FROM auth_user')).rowCount).toBe(0);
      expect((await store.second.query('SELECT id FROM auth_account')).rowCount).toBe(0);
      await store.first.query('ALTER TABLE auth_account DROP CONSTRAINT reject_test_credentials');
      const owner = await bootstrapOwner(store.first, input);
      expect((await store.second.query('SELECT id,role FROM auth_user')).rows)
        .toEqual([{ id: owner.id, role: 'owner' }]);
      expect((await store.second.query('SELECT "userId" FROM auth_account')).rows)
        .toEqual([{ userId: owner.id }]);
    } finally { await store.cleanup(); }
  }, 30000);

  it('denies public signup/bootstrap/user update without creating any account', async () => {
    for (const path of ['sign-up/email', 'bootstrap-owner', 'update-user', 'admin/create-user']) {
      const response = await handleAuthRequest(fixture.auth, request(path, { name: 'Intruder', email: 'intruder@ticket.invalid', password: fixturePassword, role: 'owner' }));
      expect(response.status).toBe(404);
    }
    // The library is independently configured to refuse signup, even without the route allowlist.
    const signup = await fixture.auth.handler(request('sign-up/email', { name: 'Intruder', email: 'intruder@ticket.invalid', password: fixturePassword, role: 'owner' }));
    expect(signup.ok).toBe(false);
    expect((await fixture.pool.query('SELECT id FROM auth_user WHERE email=$1', ['intruder@ticket.invalid'])).rowCount).toBe(0);
  });

  it('wrong password and unknown email create no sessions and give the same failure', async () => {
    const a = await handleAuthRequest(fixture.auth, request('sign-in/email', { email: fixtureAccounts.owner.email, password: 'wrong password value' }));
    const b = await handleAuthRequest(fixture.auth, request('sign-in/email', { email: 'unknown@ticket.invalid', password: 'wrong password value' }));
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
    expect((await fixture.pool.query('SELECT id FROM auth_session')).rowCount).toBe(0);
  });

  it.each(['owner', 'organizer', 'scanner'] as const)('%s login cannot promote its role, and session survives a second auth instance until logout', async role => {
    const response = await handleAuthRequest(fixture.auth, request('sign-in/email', { email: fixtureAccounts[role].email, password: fixturePassword, role: 'owner', rememberMe: false }));
    expect(response.status).toBe(200);
    const cookie = cookieFrom(response);
    expect(cookie).toContain('ticket.session_token=');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
    const second = createAuth(fixture.pool, fixture.settings);
    const actor = await readActor(second, new Headers({ Cookie: cookie }));
    expect(actor).toEqual({ id: fixture.ids[role], name: fixtureAccounts[role].name, role });
    expect(roleAccess(actor, 'owner')).toBe(role === 'owner' ? 'allowed' : 'forbidden');
    const tampered = cookie.replace(/session_token=(.)/, (_, first) => `session_token=${first === 'X' ? 'Y' : 'X'}`);
    expect(await readActor(second, new Headers({ Cookie: tampered }))).toBeNull();
    const logout = await handleAuthRequest(fixture.auth, request('sign-out', {}, cookie));
    expect(logout.status).toBe(200);
    expect(await readActor(second, new Headers({ Cookie: cookie }))).toBeNull();
  });

  it('rejects foreign-origin login and expired/revoked sessions', async () => {
    const sessionCount = (await fixture.pool.query('SELECT count(*) AS n FROM auth_session')).rows[0].n;
    for (const origin of ['https://attacker.invalid', 'null', null]) {
      const attempted = request('sign-in/email', { email: fixtureAccounts.owner.email, password: fixturePassword }, undefined, origin ?? 'http://127.0.0.1:3100');
      if (origin === null) attempted.headers.delete('Origin');
      const badOrigin = await handleAuthRequest(fixture.auth, attempted);
      expect(badOrigin.status).toBe(403);
    }
    expect((await fixture.pool.query('SELECT count(*) AS n FROM auth_session')).rows[0].n).toBe(sessionCount);
    const login = await handleAuthRequest(fixture.auth, request('sign-in/email', { email: fixtureAccounts.owner.email, password: fixturePassword }));
    const cookie = cookieFrom(login);
    await fixture.pool.query('UPDATE auth_session SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1', [fixture.ids.owner]);
    expect(await readActor(fixture.auth, new Headers({ Cookie: cookie }))).toBeNull();
  });

  it('an existing session reads the current database role and fails closed for an unknown role', async () => {
    const login = await handleAuthRequest(fixture.auth, request('sign-in/email', { email: fixtureAccounts.organizer.email, password: fixturePassword }));
    expect(login.status).toBe(200);
    const cookie = cookieFrom(login);
    const headers = new Headers({ Cookie: cookie });
    const second = createAuth(fixture.pool, fixture.settings);
    expect(await readActor(second, headers)).toMatchObject({ role: 'organizer' });
    try {
      await fixture.pool.query('UPDATE auth_user SET role=$1 WHERE id=$2', ['scanner', fixture.ids.organizer]);
      const actor = await readActor(fixture.auth, headers);
      expect(actor).toMatchObject({ role: 'scanner' });
      expect(roleAccess(actor, 'organizer')).toBe('forbidden');
      expect(roleAccess(actor, 'owner')).toBe('forbidden');
      await fixture.pool.query('UPDATE auth_user SET role=$1 WHERE id=$2', ['unrecognized', fixture.ids.organizer]);
      expect(await readActor(second, headers)).toBeNull();
    } finally {
      await fixture.pool.query('UPDATE auth_user SET role=$1 WHERE id=$2', ['organizer', fixture.ids.organizer]);
      await handleAuthRequest(fixture.auth, request('sign-out', {}, cookie));
    }
  });

  it('uses shared database throttling across two auth instances', async () => {
    const second = createAuth(fixture.pool, fixture.settings);
    const makeAttempt = () => new Request(`${baseURL}/api/auth/sign-in/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseURL, 'x-forwarded-for': '192.0.2.240' },
      body: JSON.stringify({ email: 'rate-test@ticket.invalid', password: 'incorrect test password' }),
    });
    for (const auth of [fixture.auth, second, fixture.auth]) expect((await handleAuthRequest(auth, makeAttempt())).status).toBe(401);
    expect((await handleAuthRequest(second, makeAttempt())).status).toBe(429);
  });
});
