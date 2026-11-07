import { getAuth } from '@/server/auth';
import {
  getEventDetails,
  updateEventDraft,
  submitSessionForApproval,
  revertEventToDraft,
  deleteEventDraft,
  type SessionDraftInput,
} from '@/server/events';
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
  if (session?.user.role !== 'organizer' && session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const isOwner = session.user.role === 'owner';
    const updated = await updateEventDraft(
      pool,
      id,
      session.user.id,
      {
        title: typeof body.title === 'string' ? body.title : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        location: typeof body.location === 'string' ? body.location : undefined,
        posterUrl: typeof body.posterUrl === 'string' ? body.posterUrl : undefined,
        ticketTemplateUrl: typeof body.ticketTemplateUrl === 'string' ? body.ticketTemplateUrl : undefined,
        limitPerOrder: typeof body.limitPerOrder === 'number' ? body.limitPerOrder : undefined,
        coverBannerUrl: typeof body.coverBannerUrl === 'string' ? body.coverBannerUrl : undefined,
        googleMapsUrl: typeof body.googleMapsUrl === 'string' ? body.googleMapsUrl : undefined,
        salesStartTime: typeof body.salesStartTime === 'string' ? body.salesStartTime : undefined,
        salesEndTime: typeof body.salesEndTime === 'string' ? body.salesEndTime : undefined,
        ageRestriction: typeof body.ageRestriction === 'string' ? body.ageRestriction : undefined,
        refundPolicy: typeof body.refundPolicy === 'string' ? body.refundPolicy : undefined,
        entryGuidelines: typeof body.entryGuidelines === 'string' ? body.entryGuidelines : undefined,
        payoutAccountId: typeof body.payoutAccountId === 'string' ? body.payoutAccountId : undefined,
        payoutBankName: typeof body.payoutBankName === 'string' ? body.payoutBankName : undefined,
        payoutAccountNumber: typeof body.payoutAccountNumber === 'string' ? body.payoutAccountNumber : undefined,
        payoutAccountName: typeof body.payoutAccountName === 'string' ? body.payoutAccountName : undefined,
        ubuPrivilegeMode: typeof body.ubuPrivilegeMode === 'boolean' ? body.ubuPrivilegeMode : undefined,
      },
      Array.isArray(body.sessions) ? (body.sessions as SessionDraftInput[]) : undefined,
      isOwner,
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
  const { id } = await params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'submit-event') {
    const pool = auth.options.database as Pool;
    try {
      const eventDetails = await getEventDetails(pool, id, session.user.id);
      if (!eventDetails) return Response.json({ message: 'ไม่พบงานคอนเสิร์ต' }, { status: 404 });
      for (const sess of eventDetails.sessions) {
        if (sess.status === 'draft') {
          await submitSessionForApproval(pool, sess.id, session.user.id);
        }
      }
      await pool.query(
        `UPDATE events SET status = 'pending_approval', "updatedAt" = now() WHERE id = $1`,
        [id],
      );
      return Response.json({ message: 'ส่งงานคอนเสิร์ตเพื่อขออนุมัติสำเร็จ' }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
      return Response.json({ message }, { status: 400 });
    }
  }

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

  if (action === 'revert-to-draft') {
    const pool = auth.options.database as Pool;
    try {
      await revertEventToDraft(pool, id, session.user.id);
      return Response.json({ message: 'ดึงงานคอนเสิร์ตกลับมาเป็นฉบับร่างเรียบร้อยแล้ว' }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการดึงกลับเป็นฉบับร่าง';
      return Response.json({ message }, { status: 400 });
    }
  }

  return Response.json({ message: 'Unknown action' }, { status: 400 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'organizer') {
    return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  try {
    await deleteEventDraft(pool, id, session.user.id);
    return Response.json({ message: 'ลบงานคอนเสิร์ตเรียบร้อยแล้ว' }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการลบ';
    return Response.json({ message }, { status: 400 });
  }
}
