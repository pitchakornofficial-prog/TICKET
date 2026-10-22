import { getAuth } from '@/server/auth';
import {
  getEventPrimaryScanner,
  setEventPrimaryScanner,
  removeEventPrimaryScanner,
} from '@/server/primary-scanner';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const primary = await getEventPrimaryScanner(pool, eventId);
    return Response.json({ primaryScanner: primary }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงข้อมูลเครื่องหลัก';
    return Response.json({ message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  let body: { scannerId?: string; deviceId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'ข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  if (!body.scannerId?.trim()) {
    return Response.json({ message: 'กรุณาระบุรหัสทีมสแกน (scannerId)' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;

  try {
    const primary = await setEventPrimaryScanner(
      pool,
      { id: session.user.id, role: session.user.role },
      eventId,
      body.scannerId.trim(),
      body.deviceId?.trim(),
    );
    return Response.json(
      {
        message: 'กำหนดเครื่องหลักสำหรับงานเรียบร้อยแล้ว (AC-94)',
        primaryScanner: primary,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการกำหนดเครื่องหลัก';
    const status = message.includes('ไม่อนุญาต') ? 403 : message.includes('ไม่พบ') ? 404 : 400;
    return Response.json({ message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    await removeEventPrimaryScanner(pool, { id: session.user.id, role: session.user.role }, eventId);
    return Response.json({ message: 'ยกเลิกการกำหนดเครื่องหลักเรียบร้อยแล้ว' }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    const status = message.includes('ไม่อนุญาต') ? 403 : 400;
    return Response.json({ message }, { status });
  }
}
