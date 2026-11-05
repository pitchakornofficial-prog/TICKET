import { spawn } from 'node:child_process';
import { authFixture } from './auth-fixture.ts';

const fixture = await authFixture('e2e');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3100'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_DIST_DIR: '.next-e2e',
    DATABASE_URL: fixture.databaseUrl,
    BETTER_AUTH_URL: fixture.settings.baseURL,
    BETTER_AUTH_SECRET: fixture.settings.secret,
    // Never inherit real provider credentials from the shell or Next's .env.local.
    STRIPE_SECRET_KEY: '',
    STRIPE_PUBLISHABLE_KEY: '',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
    STRIPE_LIVE_MODE: 'false',
    RESEND_API_KEY: '',
    EMAIL_FROM: '',
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: '',
    R2_ENDPOINT: '',
  },
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill('SIGTERM');
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', async code => {
  await fixture.cleanup();
  process.exitCode = stopping ? 0 : (code ?? 1);
});
