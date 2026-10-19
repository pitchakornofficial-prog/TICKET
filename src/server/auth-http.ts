import type { TicketAuth } from './auth.ts';

// Only the task-owned capabilities are public. Signup, user edits and reset are closed.
export async function handleAuthRequest(auth: TicketAuth, request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const allowed = (request.method === 'GET' && path === '/api/auth/get-session')
    || (request.method === 'POST' && ['/api/auth/sign-in/email', '/api/auth/sign-out'].includes(path));
  if (!allowed) return Response.json({ message: 'ไม่พบเส้นทางที่ร้องขอ' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  // Require our configured origin even for a first login with no cookie/Fetch Metadata.
  // Do not infer trust from the incoming Host header or a supplied callback URL.
  if (request.method === 'POST' && request.headers.get('origin') !== new URL(auth.options.baseURL).origin) {
    return Response.json({ message: 'ไม่อนุญาตคำขอจากแหล่งนี้' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const response = await auth.handler(request);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
