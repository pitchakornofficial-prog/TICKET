import { getAuth } from '@/server/auth';
import { createEventDraft, listOrganizerEvents } from '@/server/events';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  const events = await listOrganizerEvents(pool, session.user.id);
  return Response.json({ events }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น' }, { status: 403 });
  }

  let body: {
    title?: string;
    description?: string;
    location?: string;
    posterUrl?: string;
    limitPerOrder?: number;
    sessions?: {
      startTime: string;
      endTime: string;
      admissionStartTime?: string;
      admissionEndTime?: string;
      ticketTypes: {
        name: string;
        price: number;
        quota: number;
        description?: string;
      }[];
    }[];
  } = {};

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.title || !body.location) {
    return Response.json({ message: 'กรุณาระบุชื่องานและสถานที่จัดงาน' }, { status: 400 });
  }

  try {
    const pool = auth.options.database as Pool;
    const event = await createEventDraft(
      pool,
      session.user.id,
      {
        title: body.title,
        description: body.description,
        location: body.location,
        posterUrl: body.posterUrl,
        limitPerOrder: body.limitPerOrder ?? 4,
      },
      body.sessions || [],
    );
    return Response.json({ message: 'สร้างงานคอนเสิร์ตสำเร็จ', event }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกงาน';
    return Response.json({ message }, { status: 400 });
  }
}
