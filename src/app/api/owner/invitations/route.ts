import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import {
  createOrganizerInvitation,
  InvitationSecurityError,
  listBackOfficeAccounts,
  listOrganizerInvitations,
} from '@/server/invitation';
import { extractClientIp } from '@/server/guest-otp';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const pool = getDatabasePool();
  try {
    const [invitations, accounts] = await Promise.all([
      listOrganizerInvitations(pool),
      listBackOfficeAccounts(pool),
    ]);
    return Response.json(
      { invitations, organizers: accounts.organizers, admins: accounts.admins },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการโหลดรายการคำเชิญ', { defaultStatus: 500 });
  }
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const pool = getDatabasePool();
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      role?: string;
      confirmPassword?: string;
    };
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
      {
        userId: session.user.id,
        name: session.user.name,
        email: session.user.email,
        ipAddress: extractClientIp(request),
        confirmPassword: typeof body.confirmPassword === 'string' ? body.confirmPassword : '',
      },
    );

    return Response.json(
      {
        message: 'ส่งคำเชิญสำเร็จ',
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    if (error instanceof InvitationSecurityError) {
      return Response.json({ message: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } });
    }
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งคำเชิญ', { defaultStatus: 400 });
  }
}
