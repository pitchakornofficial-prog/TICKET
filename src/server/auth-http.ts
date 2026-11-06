import type { TicketAuth } from './auth.ts';

// Only the task-owned capabilities are public. Signup, user edits and reset are closed.
export async function handleAuthRequest(auth: TicketAuth, request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const isResetTokenGet = request.method === 'GET' && path.startsWith('/api/auth/reset-password/');
  const isVerifyInvitationGet = request.method === 'GET' && path === '/api/auth/verify-invitation';
  const allowed = (request.method === 'GET' && (path === '/api/auth/get-session' || isResetTokenGet || isVerifyInvitationGet))
    || (request.method === 'POST' && [
      '/api/auth/sign-in/email',
      '/api/auth/sign-out',
      '/api/auth/request-password-reset',
      '/api/auth/reset-password',
      '/api/auth/invite-organizer',
      '/api/auth/accept-invitation',
    ].includes(path));
  if (!allowed) return Response.json({ message: 'ไม่พบเส้นทางที่ร้องขอ' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
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
    let body: { email?: string; role?: string } = {};
    try { body = await cloned.json(); } catch {}
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const invitedRole: 'organizer' | 'owner' = body.role === 'owner' ? 'owner' : 'organizer';

    if (!email) {
      return Response.json({ message: 'กรุณาระบุอีเมล' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    try {
      const pool = auth.options.database as import('pg').Pool;
      const { createOrganizerInvitation } = await import('./invitation.ts');
      const inv = await createOrganizerInvitation(pool, email, auth.options.baseURL, new Date(), invitedRole);
      return Response.json({ message: 'ส่งคำเชิญสำเร็จ', id: inv.id, email: inv.email, role: inv.role }, {
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
      return Response.json({ message: 'ตั้งบัญชีผู้ใช้สำเร็จ', user }, {
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
