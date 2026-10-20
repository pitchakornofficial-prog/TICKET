import { getAuth } from '@/server/auth';
import { getEventDetails, updateEventDraft, submitSessionForApproval, type SessionDraftInput } from '@/server/events';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer' && session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  try {
    const event = await getEventDetails(pool, id, session.user.role === 'organizer' ? session.user.id : undefined);
    if (!event) return Response.json({ message: 'ไม่พบงานคอนเสิร์ต' }, { status: 404 });
    return Response.json({ event }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return Response.json({ message }, { status: 403 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานเท่านั้น' }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const updated = await updateEventDraft(
      pool,
      id,
      session.user.id,
      {
        title: typeof body.title === 'string' ? body.title : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        location: typeof body.location === 'string' ? body.location : undefined,
        posterUrl: typeof body.posterUrl === 'string' ? body.posterUrl : undefined,
        limitPerOrder: typeof body.limitPerOrder === 'number' ? body.limitPerOrder : undefined,
      },
      Array.isArray(body.sessions) ? (body.sessions as SessionDraftInput[]) : undefined,
    );
    return Response.json({ message: 'อัปเดตงานคอนเสิร์ตสำเร็จ', event: updated }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return Response.json({ message }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'submit-session') {
    let body: { sessionId?: string } = {};
    try { body = await request.json(); } catch {}
    if (!body.sessionId) return Response.json({ message: 'กรุณาระบุ sessionId' }, { status: 400 });

    const pool = auth.options.database as Pool;
    try {
      await submitSessionForApproval(pool, body.sessionId, session.user.id);
      return Response.json({ message: 'ส่งรอบการแสดงเพื่อขออนุมัติสำเร็จ' }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
      return Response.json({ message }, { status: 400 });
    }
  }

  return Response.json({ message: 'Unknown action' }, { status: 400 });
}
