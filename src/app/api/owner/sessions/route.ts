import { getAuth } from '@/server/auth';
import { listPendingSessionsForOwner, approveSession, rejectSession } from '@/server/events';
import { saveEventFeeSettings, getEventFeeSettings } from '@/server/fees';
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

  let body: {
    sessionId?: string;
    action?: 'approve' | 'reject';
    rejectionReason?: string;
    organizerFeeRate?: number;
    reservePercentage?: number;
    ubuPrivilegeMode?: boolean;
    organizerFeePrivilegeRate?: number;
  } = {};

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
    if (body.action === 'reject') {
      const result = await rejectSession(
        pool,
        body.sessionId,
        session.user.id,
        body.rejectionReason || 'ข้อมูลหรือเงื่อนไขคอนเสิร์ตไม่ผ่านเกณฑ์การอนุมัติ',
      );
      return Response.json({ message: 'ปฏิเสธคำขอเปิดรอบการแสดงสำเร็จ', result }, { status: 200 });
    }

    const result = await approveSession(pool, body.sessionId, session.user.id);

    // Apply custom fee settings if provided (D-219)
    if (
      body.organizerFeeRate !== undefined ||
      body.reservePercentage !== undefined ||
      body.ubuPrivilegeMode !== undefined ||
      body.organizerFeePrivilegeRate !== undefined
    ) {
      try {
        const existingFee = await getEventFeeSettings(pool, result.eventId);
        await saveEventFeeSettings(
          pool,
          result.eventId,
          {
            organizerFeeMode: 'percentage',
            organizerFeeRate: Number(body.organizerFeeRate ?? existingFee.organizerFeeRate ?? 3),
            organizerFeePrivilegeRate: Number(
              body.organizerFeePrivilegeRate ?? existingFee.organizerFeePrivilegeRate ?? 0,
            ),
            ubuPrivilegeMode:
              body.ubuPrivilegeMode !== undefined
                ? Boolean(body.ubuPrivilegeMode)
                : Boolean(existingFee.ubuPrivilegeMode),
            customerFeeMode: existingFee.customerFeeMode || 'per_ticket',
            customerFeeRate: Number(existingFee.customerFeeRate || 0),
            reservePercentage: Number(body.reservePercentage ?? existingFee.reservePercentage ?? 0),
          },
          session.user.id,
        );
      } catch (feeError) {
        console.warn('Could not update custom fee settings on approval:', feeError);
      }
    }

    return Response.json({ message: 'อนุมัติรอบการแสดงและบันทึกข้อตกลงค่าบริการสำเร็จ', result }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return Response.json({ message }, { status: 400 });
  }
}
