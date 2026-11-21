import { createSafeErrorResponse } from '@/server/api-error';
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
  const rawDateFrom = url.searchParams.get('dateFrom') || undefined;
  const rawDateTo = url.searchParams.get('dateTo') || undefined;
  const dateFrom = rawDateFrom && !Number.isNaN(Date.parse(rawDateFrom)) ? rawDateFrom : undefined;
  const dateTo = rawDateTo && !Number.isNaN(Date.parse(rawDateTo)) ? rawDateTo : undefined;
  if ((rawDateFrom && !dateFrom) || (rawDateTo && !dateTo)) {
    return Response.json({ message: 'รูปแบบช่วงวันที่ไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    const pool = getDatabasePool();
    const orders = await listPaidOrdersForOwner(pool, search, { dateFrom, dateTo });
    return Response.json({ orders }, { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงข้อมูลคำสั่งซื้อ', { defaultStatus: 500 });
  }
}
