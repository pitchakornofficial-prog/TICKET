import { getAuth } from '@/server/auth';
import { listScannersForEvent, addScannerToEvent } from '@/server/events';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const scanners = await listScannersForEvent(pool, session.user.id, eventId);
    return Response.json({ scanners }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงรายชื่อทีมสแกน';
    const status = message.includes('ไม่มีสิทธิ์') ? 403 : 400;
    return Response.json({ message }, { status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  let body: { name?: string; email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.email?.trim()) {
    return Response.json({ message: 'กรุณาระบุอีเมล' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;

  try {
    const result = await addScannerToEvent(pool, session.user.id, eventId, {
      name: body.name || 'ทีมสแกนบัตร',
      email: body.email,
      password: body.password,
    });
    return Response.json({ message: 'เพิ่มทีมสแกนสำหรับงานสำเร็จ', scanner: result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการเพิ่มทีมสแกน';
    const status = message.includes('ไม่มีสิทธิ์') ? 403 : 400;
    return Response.json({ message }, { status });
  }
}
