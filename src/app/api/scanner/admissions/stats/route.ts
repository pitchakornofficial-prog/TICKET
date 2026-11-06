import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { getAdmissionStats, getRecentAdmissionLogs } from '@/server/admission';

export async function GET(req: Request) {
  let actor = await readActor(getAuth(), req.headers);
  if (!actor) {
    try {
      actor = await readActor(getAuth(), await headers());
    } catch {
      // Ignore if headers() throws outside Next request context
    }
  }
  if (!actor) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  if (!['scanner', 'organizer', 'owner'].includes(actor.role)) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงสถิติการสแกน' },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', message: 'กรุณาระบุ sessionId' },
      { status: 400 },
    );
  }

  try {
    const pool = getDatabasePool();

    // Verify session existence and retrieve owning event and organizer
    const sessRes = await pool.query<{ eventId: string; organizerId: string }>(
      `SELECT s."eventId", e."organizerId"
       FROM event_sessions s
       JOIN events e ON e.id = s."eventId"
       WHERE s.id = $1`,
      [sessionId],
    );

    if (sessRes.rowCount === 0) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'ไม่พบข้อมูลรอบการแสดงที่ระบุ' },
        { status: 404 },
      );
    }

    const { eventId, organizerId } = sessRes.rows[0];

    // Authorization checks:
    // 1. Organizer can only view stats for their own event
    if (actor.role === 'organizer' && organizerId !== actor.id) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'คุณไม่มีสิทธิ์เข้าถึงสถิติการสแกนของงานคอนเสิร์ตนี้' },
        { status: 403 },
      );
    }

    // 2. Scanner can only view stats if assigned to this event
    if (actor.role === 'scanner') {
      const scanRes = await pool.query(
        'SELECT 1 FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2',
        [eventId, actor.id],
      );
      if (scanRes.rowCount === 0) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'คุณไม่ได้รับมอบหมายให้ปฏิบัติหน้าที่ในงานคอนเสิร์ตนี้' },
          { status: 403 },
        );
      }
    }

    // 3. Scanner session scope cookie check (for direct-access links)
    const auth = getAuth();
    const secret =
      process.env.BETTER_AUTH_SECRET || (auth.options as { secret: string }).secret;
    const { verifyScannerSessionEventScope } = await import('@/server/scanner-scope');
    const scopeCheck = await verifyScannerSessionEventScope(
      pool,
      actor.role,
      req.headers.get('cookie'),
      secret,
      { sessionId, eventId, scannerId: actor.id },
    );
    if (!scopeCheck.allowed) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: scopeCheck.reason },
        { status: 403 },
      );
    }

    const stats = await getAdmissionStats(pool, sessionId);
    const recentLogs = await getRecentAdmissionLogs(pool, sessionId, 20);

    return NextResponse.json({ stats, recentLogs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดสถิติ';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 });
  }
}
