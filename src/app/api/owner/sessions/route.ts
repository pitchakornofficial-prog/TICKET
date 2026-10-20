import { getAuth } from '@/server/auth';
import { listPendingSessionsForOwner, approveSession } from '@/server/events';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  const pendingSessions = await listPendingSessionsForOwner(pool);
  return Response.json({ pendingSessions }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  let body: { sessionId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.sessionId) {
    return Response.json({ message: 'กรุณาระบุ sessionId' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const result = await approveSession(pool, body.sessionId, session.user.id);
    return Response.json({ message: 'อนุมัติรอบการแสดงสำเร็จ', result }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return Response.json({ message }, { status: 400 });
  }
}
