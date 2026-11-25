import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import {
  listNotificationsForActor,
  markNotificationRead,
  markAllNotificationsRead,
  toggleNotificationSaved,
  deleteNotification,
  backfillNotificationsFromRealEvents,
} from '@/server/notifications';
import { readBoundedJson } from '@/server/upload-quota';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || !['owner', 'organizer', 'scanner'].includes(session.user.role)) {
    return Response.json({ message: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  const pool = getDatabasePool();
  const url = new URL(request.url);
  const tab = (url.searchParams.get('tab') as 'all' | 'unread' | 'saved') || 'all';

  try {
    const actor = {
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role as 'owner' | 'organizer' | 'scanner',
    };

    // Attempt backfill if table was freshly created / empty
    await backfillNotificationsFromRealEvents(pool).catch(() => {});

    const result = await listNotificationsForActor(pool, actor, { tab });
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    });
  } catch (error) {
    return createSafeErrorResponse(error, 'โหลดการแจ้งเตือนไม่สำเร็จ', { defaultStatus: 500 });
  }
}

export async function PATCH(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || !['owner', 'organizer', 'scanner'].includes(session.user.role)) {
    return Response.json({ message: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  const pool = getDatabasePool();
  let body: { action?: string; id?: string; isRead?: boolean; isSaved?: boolean };
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as typeof body;
  } catch {
    return Response.json({ message: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const actor = {
    userId: session.user.id,
    email: session.user.email,
    role: session.user.role as 'owner' | 'organizer' | 'scanner',
  };

  try {
    if (body.action === 'mark-all-read') {
      const count = await markAllNotificationsRead(pool, actor);
      return Response.json({ success: true, updatedCount: count });
    }

    if (body.action === 'mark-read' && body.id) {
      const success = await markNotificationRead(pool, actor, body.id, body.isRead ?? true);
      return Response.json({ success });
    }

    if (body.action === 'toggle-save' && body.id) {
      const success = await toggleNotificationSaved(pool, actor, body.id, body.isSaved);
      return Response.json({ success });
    }

    return Response.json({ message: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });
  } catch (error) {
    return createSafeErrorResponse(error, 'อัปเดตการแจ้งเตือนไม่สำเร็จ', { defaultStatus: 500 });
  }
}

export async function DELETE(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || !['owner', 'organizer', 'scanner'].includes(session.user.role)) {
    return Response.json({ message: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
  }

  const pool = getDatabasePool();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return Response.json({ message: 'ระบุรหัสการแจ้งเตือน' }, { status: 400 });
  }

  const actor = {
    userId: session.user.id,
    email: session.user.email,
    role: session.user.role as 'owner' | 'organizer' | 'scanner',
  };

  try {
    const success = await deleteNotification(pool, actor, id);
    return Response.json({ success });
  } catch (error) {
    return createSafeErrorResponse(error, 'ลบการแจ้งเตือนไม่สำเร็จ', { defaultStatus: 500 });
  }
}
