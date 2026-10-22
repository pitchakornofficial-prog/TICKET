import { getAuth } from '@/server/auth';
import { getEventFeeSettings } from '@/server/fees';
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

  // Verify event belongs to this organizer
  const check = await pool.query('SELECT "organizerId" FROM events WHERE id = $1', [eventId]);
  if (check.rowCount === 0 || check.rows[0].organizerId !== session.user.id) {
    return Response.json({ message: 'ไม่พบคอนเสิร์ตของคุณ' }, { status: 404 });
  }

  try {
    const feeSettings = await getEventFeeSettings(pool, eventId);
    return Response.json({ feeSettings }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return Response.json({ message }, { status: 500 });
  }
}

export async function PUT(
  _request: Request,
  _context: { params: Promise<{ id: string }> },
) {
  // Organizers are strictly forbidden from modifying fee settings!
  return Response.json(
    { message: 'ไม่อนุญาต: ผู้จัดงานไม่สามารถแก้ไขการตั้งค่าบริการและเงินสำรองได้' },
    { status: 403 },
  );
}

export async function POST(
  _request: Request,
  _context: { params: Promise<{ id: string }> },
) {
  return Response.json(
    { message: 'ไม่อนุญาต: ผู้จัดงานไม่สามารถแก้ไขการตั้งค่าบริการและเงินสำรองได้' },
    { status: 403 },
  );
}
