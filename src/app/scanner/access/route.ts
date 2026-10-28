import { NextResponse } from 'next/server';
import { randomUUID, createHmac } from 'node:crypto';
import { getAuth } from '@/server/auth';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scannerId = url.searchParams.get('scannerId');
  const eventId = url.searchParams.get('eventId');

  if (!scannerId || !eventId) {
    return NextResponse.json(
      { message: 'ลิงก์ไม่ถูกต้อง: ขาดข้อมูลผู้ใช้งานหรือคอนเสิร์ต' },
      { status: 400 },
    );
  }

  const auth = getAuth();
  const pool = auth.options.database as Pool;

  try {
    // 1. Verify that scanner exists and is assigned to this event
    const res = await pool.query<{ id: string; role: string; name: string }>(
      `SELECT u.id, u.role, u.name
       FROM auth_user u
       JOIN event_scanners es ON es."scannerId" = u.id
       WHERE u.id = $1 AND es."eventId" = $2 AND u.role = 'scanner'`,
      [scannerId, eventId],
    );

    if (res.rowCount === 0) {
      return NextResponse.json(
        { message: 'ไม่พบสิทธิ์เจ้าหน้าที่สแกนบัตรสำหรับคอนเสิร์ตนี้' },
        { status: 403 },
      );
    }

    // 2. Generate secure session
    const sessionId = randomUUID();
    const sessionToken = `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    await pool.query(
      `INSERT INTO auth_session (id, token, "userId", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())`,
      [sessionId, sessionToken, scannerId, expiresAt],
    );

    // 3. Set cookie and redirect to /back-office/scanner
    const redirectUrl = new URL('/back-office/scanner', url.origin);
    const response = NextResponse.redirect(redirectUrl);

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

    return response;
  } catch (error) {
    console.error('Scanner access error:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาดในการยืนยันสิทธิ์เข้าใช้งาน' },
      { status: 500 },
    );
  }
}
