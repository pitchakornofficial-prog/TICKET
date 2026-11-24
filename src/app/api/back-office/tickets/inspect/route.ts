export const runtime = 'nodejs';

import { getAuth, readActor } from '@/server/auth.ts';
import { assertSameOrigin } from '@/server/origin.ts';
import { createSafeErrorResponse } from '@/server/api-error.ts';
import { inspectTicketPayload, getRecentSampleTickets } from '@/server/ticket-inspector.ts';
import type { Pool } from 'pg';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const auth = getAuth();
    const actor = await readActor(auth, request.headers);
    if (!actor || !['owner', 'organizer', 'scanner'].includes(actor.role)) {
      return Response.json({ message: 'ไม่อนุญาต: ต้องเข้าสู่ระบบในบทบาทที่ได้รับอนุญาต' }, { status: 403 });
    }

    const pool = auth.options.database as Pool;
    const body = (await request.json().catch(() => ({}))) as { qrPayloadOrCode?: string };

    const result = await inspectTicketPayload(pool, actor, {
      qrPayloadOrCode: body.qrPayloadOrCode || '',
    });

    return Response.json(result, { status: 200 });
  } catch (error) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการตรวจสอบคิวอาร์โค้ดบัตร', { defaultStatus: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const auth = getAuth();
    const actor = await readActor(auth, request.headers);
    if (!actor || !['owner', 'organizer', 'scanner'].includes(actor.role)) {
      return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
    }

    const pool = auth.options.database as Pool;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'recent-samples') {
      const samples = await getRecentSampleTickets(pool, actor);
      return Response.json({ samples }, { status: 200 });
    }

    // Direct search via GET param if provided
    const code = url.searchParams.get('code');
    if (code) {
      const result = await inspectTicketPayload(pool, actor, { qrPayloadOrCode: code });
      return Response.json(result, { status: 200 });
    }

    return Response.json({ message: 'ไม่มีคำสั่งที่ระบุ' }, { status: 400 });
  } catch (error) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงข้อมูลตัวอย่างบัตร', { defaultStatus: 500 });
  }
}
