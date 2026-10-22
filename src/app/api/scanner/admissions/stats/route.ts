import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { getAdmissionStats, getRecentAdmissionLogs } from '@/server/admission';

export async function GET(req: Request) {
  const actor = await readActor(getAuth(), await headers());
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
    const stats = await getAdmissionStats(pool, sessionId);
    const recentLogs = await getRecentAdmissionLogs(pool, sessionId, 20);

    return NextResponse.json({ stats, recentLogs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดสถิติ';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 });
  }
}
