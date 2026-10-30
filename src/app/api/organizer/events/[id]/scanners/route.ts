import { getAuth } from '@/server/auth';
import { listScannersForEvent, addScannerToEvent } from '@/server/events';
import { setEventPrimaryScanner } from '@/server/primary-scanner';
import { randomUUID } from 'node:crypto';
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

  const pool = auth.options.database as Pool;

  try {
    // 1. Quota check: max 3 additional scanners per concert (D-101)
    const existing = await listScannersForEvent(pool, session.user.id, eventId);
    const additionalExisting = existing.filter((s) => !s.isPrimary);
    if (additionalExisting.length >= 3 || existing.length >= 4) {
      return Response.json(
        { message: 'จำกัดจำนวนทีมสแกนเพิ่มเติมไม่เกิน 3 คนต่อคอนเสิร์ต' },
        { status: 400 },
      );
    }

    // 2. Auto-generate email and password if omitted (D-89)
    const scannerName = body.name?.trim() || 'เจ้าหน้าที่สแกน';
    const autoEmail =
      body.email?.trim() || `scanner-${randomUUID().slice(0, 8)}@ticket.local`;
    const autoPassword =
      body.password?.trim() || `Scanner!${randomUUID().replace(/-/g, '')}`;

    const result = await addScannerToEvent(pool, session.user.id, eventId, {
      name: scannerName,
      email: autoEmail,
      password: autoPassword,
    });

    // 3. Auto-set as primary scanner if first scanner in event (D-89)
    let isPrimary = false;
    if (existing.length === 0) {
      try {
        await setEventPrimaryScanner(pool, session.user, eventId, result.scannerId);
        isPrimary = true;
      } catch {
        // Handled silently
      }
    }

    const accessUrl = `/scanner/access?scannerId=${result.scannerId}&eventId=${eventId}`;

    return Response.json(
      {
        message: 'เพิ่มทีมสแกนสำหรับงานคอนเสิร์ตเรียบร้อยแล้ว',
        scanner: {
          ...result,
          isPrimary,
          accessUrl,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการเพิ่มทีมสแกน';
    const status = message.includes('ไม่มีสิทธิ์') ? 403 : 400;
    return Response.json({ message }, { status });
  }
}
