import { getAuth } from '@/server/auth';
import {
  checkHandoverReadiness,
  handoverEventPrimaryScanner,
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
  const url = new URL(request.url);
  const scannerId = url.searchParams.get('scannerId') || '';
  const oldPending = url.searchParams.get('oldPendingCount');
  const oldPendingCount = oldPending ? Number(oldPending) : undefined;

  const pool = auth.options.database as Pool;

  try {
    const readiness = await checkHandoverReadiness(pool, eventId, scannerId, oldPendingCount);
    return Response.json({ readiness }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการตรวจสอบความพร้อมการสลับเครื่อง';
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
  let body: {
    newScannerId?: string;
    oldScannerPendingCount?: number;
    reason?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'ข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  if (!body.newScannerId?.trim()) {
    return Response.json({ message: 'กรุณาระบุรหัสทีมสแกนเป้าหมาย (newScannerId)' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;

  try {
    const result = await handoverEventPrimaryScanner(
      pool,
      { id: session.user.id, role: session.user.role, name: session.user.name },
      eventId,
      body.newScannerId.trim(),
      {
        oldScannerPendingCount: body.oldScannerPendingCount,
        reason: body.reason,
      },
    );

    return Response.json(
      {
        message: 'สลับเครื่องหลักประจำงานสำเร็จ (AC-97)',
        ...result,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการสลับเครื่องหลัก';
    const status = message.includes('ไม่อนุญาต') ? 403 : message.includes('ไม่พบ') ? 404 : 400;
    return Response.json({ message }, { status });
  }
}
