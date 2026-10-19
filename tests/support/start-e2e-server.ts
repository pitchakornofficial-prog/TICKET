import { spawn } from 'node:child_process';
import { authFixture } from './auth-fixture.ts';

const fixture = await authFixture('e2e');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3100'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: fixture.databaseUrl,
    BETTER_AUTH_URL: fixture.settings.baseURL,
    BETTER_AUTH_SECRET: fixture.settings.secret,
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
