import type { TicketAuth } from './auth.ts';

// Only the task-owned capabilities are public. Signup, user edits and reset are closed.
export async function handleAuthRequest(auth: TicketAuth, request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const isResetTokenGet = request.method === 'GET' && path.startsWith('/api/auth/reset-password/');
  const isVerifyInvitationGet = request.method === 'GET' && path === '/api/auth/verify-invitation';
  const isTestInspectToken = request.method === 'GET' && path === '/api/auth/test-inspect-reset-token';
  const allowed = (request.method === 'GET' && (path === '/api/auth/get-session' || isResetTokenGet || isVerifyInvitationGet || isTestInspectToken))
    || (request.method === 'POST' && [
      '/api/auth/sign-in/email',
      '/api/auth/sign-out',
      '/api/auth/request-password-reset',
      '/api/auth/reset-password',
      '/api/auth/invite-organizer',
      '/api/auth/accept-invitation',
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
    const type = url.searchParams.get('type') || 'reset';
    if (type === 'clear_guest_cooldown' && email) {
      await pool.query('DELETE FROM guest_otp_tracking WHERE key LIKE $1', [`${email}:%`]);
      return Response.json({ cleared: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
    if (type === 'expire_order') {
      const orderId = url.searchParams.get('orderId') || '';
      if (orderId) {
        await pool.query(
          `UPDATE orders
           SET "expiresAt" = now() - interval '1 second', status = 'expired', "updatedAt" = now()
           WHERE id = $1`,
          [orderId],
        );
        return Response.json({ expired: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
      }
    }
    if (type === 'guest_otp') {
      try {
        const { ensureGuestOtpSchema } = await import('./guest-otp.ts');
        await ensureGuestOtpSchema(pool);
      } catch {
        // ignore schema error
      }
      const otpRes = await pool.query(
        'SELECT code, "requestId" FROM guest_otp WHERE email = $1 AND "consumedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1',
        [email],
      );
      if (otpRes.rowCount === 0) {
        return Response.json({ code: null }, { status: 404 });
      }
      return Response.json(
        { code: otpRes.rows[0].code, requestId: otpRes.rows[0].requestId },
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (type === 'invitation') {
      const invRes = await pool.query(
        'SELECT token FROM organizer_invitations WHERE email = $1 ORDER BY "createdAt" DESC LIMIT 1',
        [email],
      );
      if (invRes.rowCount === 0) {
        return Response.json({ token: null }, { status: 404 });
      }
      return Response.json({ token: invRes.rows[0].token }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
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
  const reqOrigin = request.headers.get('origin');
  const baseOrigin = new URL(auth.options.baseURL);
  const isLocalBase = ['127.0.0.1', 'localhost', '[::1]'].includes(baseOrigin.hostname);
  const isAllowedOrigin = isLocalBase
    ? Boolean(reqOrigin && ['127.0.0.1', 'localhost', '[::1]'].some(h => reqOrigin === `${baseOrigin.protocol}//${h}${baseOrigin.port ? `:${baseOrigin.port}` : ''}`))
    : reqOrigin === baseOrigin.origin;
  if (request.method === 'POST' && !isAllowedOrigin) {
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

  // Verify invitation token
  if (isVerifyInvitationGet) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const pool = auth.options.database as import('pg').Pool;
    const { verifyInvitation } = await import('./invitation.ts');
    const result = await verifyInvitation(pool, token);
    return Response.json(result, {
      status: result.valid ? 200 : 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Invite organizer (Owner only)
  if (request.method === 'POST' && path === '/api/auth/invite-organizer') {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user.role !== 'owner') {
      return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้นที่สามารถเชิญผู้จัดงานได้' }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const cloned = request.clone();
    let body: { email?: string } = {};
    try { body = await cloned.json(); } catch {}
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!email) {
      return Response.json({ message: 'กรุณาระบุอีเมล' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    try {
      const pool = auth.options.database as import('pg').Pool;
      const { createOrganizerInvitation } = await import('./invitation.ts');
      const inv = await createOrganizerInvitation(pool, email, auth.options.baseURL);
      return Response.json({ message: 'ส่งคำเชิญสำเร็จ', id: inv.id, email: inv.email }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถส่งคำเชิญได้';
      return Response.json({ message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  // Accept invitation
  if (request.method === 'POST' && path === '/api/auth/accept-invitation') {
    const cloned = request.clone();
    let body: { token?: string; name?: string; password?: string } = {};
    try { body = await cloned.json(); } catch {}
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token || !name || !password) {
      return Response.json({ message: 'ข้อมูลไม่ครบถ้วน' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    try {
      const pool = auth.options.database as import('pg').Pool;
      const { acceptOrganizerInvitation } = await import('./invitation.ts');
      const user = await acceptOrganizerInvitation(pool, token, { name, password });
      return Response.json({ message: 'ตั้งบัญชีผู้จัดงานสำเร็จ', user }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถตอบรับคำเชิญได้';
      return Response.json({ message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  const response = await auth.handler(request);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
