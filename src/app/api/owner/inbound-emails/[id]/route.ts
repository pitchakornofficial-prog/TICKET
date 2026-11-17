import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import {
  getInboundEmailDetail,
  type InboundEmailStatus,
  updateInboundEmailStatus,
} from '@/server/inbound-email';
import { assertSameOrigin } from '@/server/origin';
import { readBoundedJson } from '@/server/upload-quota';

export const runtime = 'nodejs';

const UPDATABLE_STATUSES = new Set<InboundEmailStatus>(['unread', 'read', 'replied', 'archived']);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const detail = await getInboundEmailDetail(getDatabasePool(), id);
    if (!detail) {
      return Response.json({ message: 'ไม่พบอีเมลที่ระบุ' }, { status: 404 });
    }
    return Response.json(detail, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    });
  } catch (error) {
    return createSafeErrorResponse(error, 'ไม่สามารถโหลดรายละเอียดอีเมลได้', {
      defaultStatus: 500,
    });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  let body: { status?: string };
  try {
    body = (await readBoundedJson(request, 8 * 1024)) as { status?: string };
  } catch {
    return Response.json({ message: 'ข้อมูลคำขอไม่ถูกต้อง' }, { status: 400 });
  }

  if (!body.status || !UPDATABLE_STATUSES.has(body.status as InboundEmailStatus)) {
    return Response.json({ message: 'สถานะไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const updated = await updateInboundEmailStatus(
      getDatabasePool(),
      id,
      body.status as InboundEmailStatus,
    );
    if (!updated) {
      return Response.json({ message: 'ไม่พบอีเมลที่ระบุ' }, { status: 404 });
    }
    return Response.json(
      { email: updated },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
      },
    );
  } catch (error) {
    return createSafeErrorResponse(error, 'ไม่สามารถอัปเดตสถานะอีเมลได้', {
      defaultStatus: 500,
    });
  }
}
