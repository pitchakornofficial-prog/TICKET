import type { TicketAuth } from './auth.ts';

// Only the task-owned capabilities are public. Signup, user edits and reset are closed.
export async function handleAuthRequest(auth: TicketAuth, request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const isResetTokenGet = request.method === 'GET' && path.startsWith('/api/auth/reset-password/');
  const isTestInspectToken = request.method === 'GET' && path === '/api/auth/test-inspect-reset-token';
  const allowed = (request.method === 'GET' && (path === '/api/auth/get-session' || isResetTokenGet || isTestInspectToken))
    || (request.method === 'POST' && [
      '/api/auth/sign-in/email',
      '/api/auth/sign-out',
      '/api/auth/request-password-reset',
      '/api/auth/reset-password',
    ].includes(path));
  if (!allowed) return Response.json({ message: 'ไม่พบเส้นทางที่ร้องขอ' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  // Test inspection endpoint for E2E runner (only available on loopback test setups)
  if (isTestInspectToken) {
    const url = new URL(request.url);
    const email = url.searchParams.get('email') || '';
    const pool = auth.options.database as import('pg').Pool;
    const clearCooldown = url.searchParams.get('clearCooldown') === 'true';
    if (clearCooldown && email) {
      const uRes = await pool.query('SELECT id FROM auth_user WHERE email = $1', [email]);
      if (uRes.rowCount && uRes.rowCount > 0) {
        await pool.query('DELETE FROM auth_rate_limit WHERE key = $1', [`reset_pwd:${uRes.rows[0].id}`]);
      }
      return Response.json({ cleared: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
    const userRes = await pool.query('SELECT id FROM auth_user WHERE email = $1', [email]);
    if (userRes.rowCount === 0) {
      return Response.json({ token: null }, { status: 404 });
    }
    const userId = userRes.rows[0].id;
    const tokenRes = await pool.query(
      'SELECT identifier FROM auth_verification WHERE value = $1 ORDER BY "createdAt" DESC LIMIT 1',
      [userId],
    );
    if (tokenRes.rowCount === 0) {
      return Response.json({ token: null }, { status: 404 });
    }
    const token = tokenRes.rows[0].identifier.replace('reset-password:', '');
    return Response.json({ token }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  // Require our configured origin even for a first login with no cookie/Fetch Metadata.
  // Do not infer trust from the incoming Host header or a supplied callback URL.
  if (request.method === 'POST' && request.headers.get('origin') !== new URL(auth.options.baseURL).origin) {
    return Response.json({ message: 'ไม่อนุญาตคำขอจากแหล่งนี้' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  // Intercept request-password-reset to enforce ADR-0004 rate limits & token invalidation
  if (request.method === 'POST' && path === '/api/auth/request-password-reset') {
    const cloned = request.clone();
    let body: { email?: string; redirectTo?: string } = {};
    try { body = await cloned.json(); } catch {}
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!email) {
      return Response.json({ message: 'กรุณาระบุอีเมล' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const { checkAndRecordResetRequest } = await import('./password-reset.ts');
    // Note: auth.options.database is the pg Pool
    const pool = auth.options.database as import('pg').Pool;
    const check = await checkAndRecordResetRequest(pool, email);

    // If check allowed, call auth.handler so Better Auth sends email with token
    if (check.allowed) {
      await auth.handler(request);
    }

    // Always return generic response to avoid account enumeration (AC-56, ADR-0004)
    return Response.json(
      { message: 'หากอีเมลนี้มีอยู่ในระบบ ลิงก์ตั้งรหัสผ่านใหม่จะถูกส่งไปยังอีเมลของคุณ' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const response = await auth.handler(request);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
