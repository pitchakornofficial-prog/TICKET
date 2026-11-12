import { NextResponse } from 'next/server';
import { randomUUID, createHmac } from 'node:crypto';
import { getAuth } from '@/server/auth';
import { ensureEventSchema } from '@/server/events';
import {
  consumeScannerAccessTokenAndBindDevice,
  inspectScannerAccessToken,
} from '@/server/scanner-access';
import {
  recordScannerSessionScope,
  signScannerEventScopeCookie,
} from '@/server/scanner-scope';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
      .filter(([k]) => Boolean(k)),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get('token')?.trim() || '';
  const eventIdParam = url.searchParams.get('eventId')?.trim() || '';

  const auth = getAuth();
  const pool = auth.options.database as Pool;

  try {
    await ensureEventSchema(pool);

    // D-105: If current actor is already logged in as organizer or owner of this event,
    // preserve their session without overwriting session cookie or consuming the one-time token!
    const currentSession = await auth.api.getSession({ headers: request.headers });
    if (currentSession?.user) {
      if (rawToken) {
        const inspected = await inspectScannerAccessToken(pool, rawToken);
        if (
          inspected &&
          !inspected.revokedAt &&
          (inspected.organizerId === currentSession.user.id ||
            currentSession.user.role === 'owner')
        ) {
          const eventId = inspected.eventId;
          const directUrl = new URL(`/back-office/scanner?eventId=${eventId}`, url.origin);
          return NextResponse.redirect(directUrl);
        }
      } else if (eventIdParam) {
        const evCheck = await pool.query<{ organizerId: string }>(
          'SELECT "organizerId" FROM events WHERE id = $1',
          [eventIdParam],
        );
        if (
          (evCheck.rowCount ?? 0) > 0 &&
          (evCheck.rows[0].organizerId === currentSession.user.id ||
            currentSession.user.role === 'owner')
        ) {
          const eventId = eventIdParam;
          const directUrl = new URL(`/back-office/scanner?eventId=${eventId}`, url.origin);
          return NextResponse.redirect(directUrl);
        }
      }
    }

    if (!rawToken) {
      return NextResponse.json(
        { message: 'ลิงก์ไม่ถูกต้อง: ต้องใช้โทเคนเข้าใช้งานแบบใช้ครั้งเดียวจากผู้จัดงาน' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Read or generate device ID cookie (D-104: Single-Device Binding)
    const cookieHeader = request.headers.get('cookie') || '';
    const cookieMap = parseCookies(cookieHeader);

    let deviceId = cookieMap.scanner_device_id;
    let shouldSetDeviceCookie = false;

    if (!deviceId) {
      deviceId = randomUUID();
      shouldSetDeviceCookie = true;
    }

    // Atomically verify & consume one-time token + bind device (D-104)
    const outcome = await consumeScannerAccessTokenAndBindDevice(pool, {
      rawToken,
      deviceId,
    });

    if (outcome.status === 'invalid') {
      return NextResponse.json(
        { message: 'ไม่พบสิทธิ์เจ้าหน้าที่สแกนบัตรหรือโทเคนไม่ถูกต้อง' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (outcome.status !== 'ok') {
      const reasonParam =
        outcome.status === 'bound_other_device' ? 'bound' : outcome.status;
      const rejectedUrl = new URL(
        `/scanner/access-rejected?reason=${encodeURIComponent(reasonParam)}&scannerName=${encodeURIComponent(outcome.scannerName)}&eventId=${encodeURIComponent(outcome.eventId)}`,
        url.origin,
      );
      const response = NextResponse.redirect(rejectedUrl);
      response.headers.set('Cache-Control', 'no-store');
      if (shouldSetDeviceCookie) {
        response.cookies.set({
          name: 'scanner_device_id',
          value: deviceId,
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: url.protocol === 'https:',
          maxAge: 365 * 24 * 60 * 60,
        });
      }
      return response;
    }

    // Generate secure session bound to this scanner & event
    const sessionId = randomUUID();
    const sessionToken = `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    await pool.query(
      `INSERT INTO auth_session (id, token, "userId", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())`,
      [sessionId, sessionToken, outcome.scannerId, expiresAt],
    );

    const eventId = outcome.eventId;
    await recordScannerSessionScope(pool, sessionToken, outcome.scannerId, eventId);

    const redirectUrl = new URL(`/back-office/scanner?eventId=${eventId}`, url.origin);
    const response = NextResponse.redirect(redirectUrl);
    response.headers.set('Cache-Control', 'no-store');

    const isSecure = url.protocol === 'https:';
    const cookieName = isSecure ? '__Secure-ticket.session_token' : 'ticket.session_token';

    const secret =
      process.env.BETTER_AUTH_SECRET || (auth.options as { secret: string }).secret;
    const signature = createHmac('sha256', secret).update(sessionToken).digest('base64');
    const signedCookieValue = `${sessionToken}.${signature}`;

    response.cookies.set({
      name: cookieName,
      value: signedCookieValue,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isSecure,
      maxAge: 8 * 60 * 60,
    });

    const signedScopeValue = signScannerEventScopeCookie(outcome.eventId, secret, {
      sessionToken,
      expiresAt,
    });

    response.cookies.set({
      name: 'scanner_event_scope',
      value: signedScopeValue,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isSecure,
      maxAge: 8 * 60 * 60,
    });

    if (shouldSetDeviceCookie) {
      response.cookies.set({
        name: 'scanner_device_id',
        value: deviceId,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isSecure,
        maxAge: 365 * 24 * 60 * 60,
      });
    }

    return response;
  } catch (error) {
    console.error('Scanner access error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาดในการยืนยันสิทธิ์เข้าใช้งาน' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
