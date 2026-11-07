import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { authFixture } from './auth-fixture.ts';
import { handleTestInspectRequest } from './test-inspect-handler.ts';

const fixture = await authFixture('e2e');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3101'], {
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
    ENABLE_PAY_TEST: 'true',
    NEXT_PUBLIC_ENABLE_PAY_TEST: 'true',
    RESEND_API_KEY: '',
    EMAIL_FROM: '',
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: '',
    R2_ENDPOINT: '',
  },
});

const proxy = createServer(async (req, res) => {
  if (req.url?.startsWith('/api/auth/test-inspect-reset-token')) {
    try {
      const result = await handleTestInspectRequest(fixture.pool, req.url);
      res.writeHead(result.status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(result.body));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Test harness error' }));
    }
    return;
  }

  const upstream = httpRequest(
    {
      hostname: '127.0.0.1',
      port: 3101,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: req.headers.host || '127.0.0.1:3100',
        origin: req.headers.origin || `http://${req.headers.host || '127.0.0.1:3100'}`,
      },
    },
    upstreamRes => {
      const headers = { ...upstreamRes.headers };
      if (typeof headers.location === 'string') {
        headers.location = headers.location.replace(':3101', ':3100');
      }
      res.writeHead(upstreamRes.statusCode || 500, headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'text/plain', 'Retry-After': '1' });
      res.end('Dev server starting up...');
    }
  });

  req.pipe(upstream);
});

proxy.on('upgrade', (req, clientSocket, _head) => {
  const upstream = httpRequest({
    hostname: '127.0.0.1',
    port: 3101,
    path: req.url,
    method: req.method,
    headers: req.headers,
  });

  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    clientSocket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(upstreamRes.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n')}\r\n\r\n`,
    );
    if (upstreamHead?.length) clientSocket.write(upstreamHead);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  upstream.on('error', () => {
    clientSocket.destroy();
  });

  upstream.end();
});

proxy.listen(3100, '127.0.0.1');

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  proxy.close();
  child.kill('SIGTERM');
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', async code => {
  try {
    proxy.close();
  } catch {}
  await fixture.cleanup();
  process.exitCode = stopping ? 0 : (code ?? 1);
});
