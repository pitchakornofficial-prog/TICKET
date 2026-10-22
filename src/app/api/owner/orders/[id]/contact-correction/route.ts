import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import {
  correctOrderContact,
  getOrderContactAuditLogs,
} from '@/server/contact-correction';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const actor = await readActor(getAuth(), await headers());

  if (!actor) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  // AC-76 Role check: Only owner is authorized
  if (actor.role !== 'owner') {
    return Response.json(
      { message: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์แก้ไขข้อมูลติดต่อของคำสั่งซื้อที่ชำระแล้ว (AC-76)' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { newEmail, newPhone, reason } = body || {};

    const pool = getDatabasePool();
    const result = await correctOrderContact(pool, {
      orderId,
      newEmail,
      newPhone,
      reason,
      actor,
    });

    if (!result.success) {
      const status =
        result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;

      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลติดต่อ';
    return Response.json({ message }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const actor = await readActor(getAuth(), await headers());

  if (!actor) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  if (actor.role !== 'owner') {
    return Response.json(
      { message: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์ดูประวัติการแก้ไขข้อมูลติดต่อ (AC-76)' },
      { status: 403 },
    );
  }

  try {
    const pool = getDatabasePool();
    const auditLogs = await getOrderContactAuditLogs(pool, orderId, actor);
    return Response.json({ auditLogs }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงประวัติการแก้ไข';
    return Response.json({ message }, { status: 500 });
  }
}
