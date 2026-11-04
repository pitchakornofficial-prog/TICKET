import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { createOrganizerInvitation, listOrganizerInvitations } from '@/server/invitation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const pool = getDatabasePool();
  try {
    const invitations = await listOrganizerInvitations(pool);
    return Response.json({ invitations }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดรายการคำเชิญ';
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
    const body = (await request.json().catch(() => ({}))) as { email?: string; role?: string };
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const invitedRole: 'organizer' | 'owner' = body.role === 'owner' ? 'owner' : 'organizer';

    if (!email) {
      return Response.json({ message: 'กรุณาระบุอีเมล' }, { status: 400 });
    }

    const invitation = await createOrganizerInvitation(
      pool,
      email,
      auth.options.baseURL,
      new Date(),
      invitedRole,
    );

    const inviteUrl = `${new URL(auth.options.baseURL).origin}/accept-invitation?token=${invitation.token}`;

    return Response.json(
      {
        message: 'ส่งคำเชิญสำเร็จ',
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        inviteUrl,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการส่งคำเชิญ';
    return Response.json({ message }, { status: 400 });
  }
}
