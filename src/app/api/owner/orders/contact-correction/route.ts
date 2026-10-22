import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { listPaidOrdersForOwner } from '@/server/contact-correction';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const actor = await readActor(getAuth(), await headers());
  if (!actor) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  // AC-76 Role check
  if (actor.role !== 'owner') {
    return Response.json(
      { message: 'ไม่มีสิทธิ์เข้าถึง (เฉพาะผู้ดูแลระบบเท่านั้น)' },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('q') || url.searchParams.get('orderId') || undefined;

  try {
    const pool = getDatabasePool();
    const orders = await listPaidOrdersForOwner(pool, search);
    return Response.json({ orders }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงข้อมูลคำสั่งซื้อ';
    return Response.json({ message }, { status: 500 });
  }
}
