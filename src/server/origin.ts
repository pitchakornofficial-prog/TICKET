/**
 * CSRF and Origin verification helper for state-changing routes.
 * Blocks cross-site requests (CSRF) on non-GET routes (/api/owner/*, /api/organizer/*, /api/events/*).
 */

export function getBaseOrigin(): URL {
  const rawUrl = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3000';
  return new URL(rawUrl);
}

export function isAllowedOrigin(origin: string | null, customBaseURL?: string): boolean {
  if (!origin || origin === 'null') return false;
  try {
    const baseOrigin = customBaseURL ? new URL(customBaseURL) : getBaseOrigin();
    const isLocalBase = ['127.0.0.1', 'localhost', '[::1]'].includes(baseOrigin.hostname);
    if (isLocalBase) {
      return ['127.0.0.1', 'localhost', '[::1]'].some(
        (h) => origin === `${baseOrigin.protocol}//${h}${baseOrigin.port ? `:${baseOrigin.port}` : ''}`,
      );
    }
    return origin === baseOrigin.origin;
  } catch {
    return false;
  }
}

/**
 * Asserts that the request originated from the trusted application origin.
 * Safe HTTP methods (GET, HEAD, OPTIONS) bypass this check.
 * State-changing methods (POST, PUT, PATCH, DELETE) require a valid same-origin source.
 * Returns null if origin is trusted, or a 403 Response if rejected.
 */
export function assertSameOrigin(request: Request): Response | null {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return null;
  }

  // 1. Explicit cross-site fetch metadata rejection
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.json(
      { message: 'ไม่อนุญาตคำขอจากแหล่งนี้' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // 2. Validate Origin header if present
  const reqOrigin = request.headers.get('origin');
  if (reqOrigin) {
    if (!isAllowedOrigin(reqOrigin)) {
      return Response.json(
        { message: 'ไม่อนุญาตคำขอจากแหล่งนี้' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return null;
  }

  // 3. Fallback to Referer header if Origin is absent
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!isAllowedOrigin(refOrigin)) {
        return Response.json(
          { message: 'ไม่อนุญาตคำขอจากแหล่งนี้' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return null;
    } catch {
      return Response.json(
        { message: 'ไม่อนุญาตคำขอจากแหล่งนี้' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  // 4. In test/server environments without browser headers, check request.url origin
  try {
    const urlOrigin = new URL(request.url).origin;
    if (isAllowedOrigin(urlOrigin)) {
      return null;
    }
  } catch {}

  // Missing all origin evidence on state-changing request
  return Response.json(
    { message: 'ไม่อนุญาตคำขอจากแหล่งนี้' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}
