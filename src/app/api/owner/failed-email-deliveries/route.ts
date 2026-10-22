import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { listFailedEmailDeliveries, retryTicketEmailDelivery } from '@/server/ticket-delivery';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const pool = getDatabasePool();
  try {
    const failedDeliveries = await listFailedEmailDeliveries(pool);
    return Response.json({ deliveries: failedDeliveries }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดรายการจัดส่งที่ล้มเหลว';
    return Response.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const pool = getDatabasePool();
  try {
    const body = await request.json().catch(() => ({}));
    if (!body.deliveryId) {
      return Response.json({ message: 'กรุณาระบุรหัสรายการจัดส่ง' }, { status: 400 });
    }

    const result = await retryTicketEmailDelivery(pool, body.deliveryId);
    return Response.json({ result }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการลองส่งอีเมลใหม่';
    return Response.json({ message }, { status: 500 });
  }
}
