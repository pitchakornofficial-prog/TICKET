import type { Pool } from 'pg';
import { getAuth } from '@/server/auth';
import { assertSameOrigin } from '@/server/origin';
import { createSafeErrorResponse } from '@/server/api-error';
import { isPayloadTooLargeError, payloadTooLargeResponse, readBoundedJson } from '@/server/http-body';
import {
  readProhibitedItems,
  saveProhibitedItems,
  type ProhibitedItemData,
} from '@/server/prohibited-items';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (session?.user?.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้ดูแลระบบ (Owner) เท่านั้น' },
      { status: 403 },
    );
  }

  const pool = auth.options.database as Pool;
  try {
    const items = await readProhibitedItems(pool);
    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการโหลดรายการสิ่งของต้องห้าม', { defaultStatus: 500 });
  }
}

export async function PUT(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (session?.user?.role !== 'owner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะผู้ดูแลระบบ (Owner) เท่านั้น' },
      { status: 403 },
    );
  }

  let body: { items?: ProhibitedItemData[] };
  try {
    body = await readBoundedJson<{ items?: ProhibitedItemData[] }>(request, 64 * 1024);
  } catch (error) {
    if (isPayloadTooLargeError(error)) return payloadTooLargeResponse();
    return Response.json({ message: 'ข้อมูล JSON ไม่ถูกต้อง' }, { status: 400 });
  }

  if (!Array.isArray(body?.items)) {
    return Response.json({ message: 'กรุณาระบุรายการสิ่งของต้องห้ามเป็น Array' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const updated = await saveProhibitedItems(pool, body.items, session.user.id);
    return Response.json(
      {
        success: true,
        message: 'บันทึกรายการกฎระเบียบและสิ่งของต้องห้ามสำเร็จ',
        items: updated,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการบันทึกรายการสิ่งของต้องห้าม', { defaultStatus: 500 });
  }
}
