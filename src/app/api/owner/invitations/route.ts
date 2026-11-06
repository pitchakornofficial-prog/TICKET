import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import {
  createOrganizerInvitation,
  listOrganizerInvitations,
  recordInvitationAuditLog,
} from '@/server/invitation';
import { verifyPassword } from 'better-auth/crypto';

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

    // Step-Up Authentication: Re-confirm owner's password when delegating full owner privileges
    if (invitedRole === 'owner') {
      const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
      if (!confirmPassword) {
        return Response.json(
          { message: 'กรุณาระบุรหัสผ่านปัจจุบันของคุณเพื่อยืนยันการเชิญผู้ดูแลระบบ (Owner)' },
          { status: 400 },
        );
      }

      const accRes = await pool.query<{ password: string }>(
        'SELECT password FROM auth_account WHERE "userId" = $1 AND "providerId" = $2',
        [session.user.id, 'credential'],
      );
      if (accRes.rowCount === 0 || !accRes.rows[0].password) {
        return Response.json({ message: 'ไม่พบบัญชีผู้ใช้' }, { status: 401 });
      }

      const isMatch = await verifyPassword({
        hash: accRes.rows[0].password,
        password: confirmPassword,
      });
      if (!isMatch) {
        return Response.json({ message: 'รหัสผ่านยืนยันไม่ถูกต้อง' }, { status: 403 });
      }
    }

    const invitation = await createOrganizerInvitation(
      pool,
      email,
      auth.options.baseURL,
      new Date(),
      invitedRole,
    );

    // Record audit log for traceability
    await recordInvitationAuditLog(pool, {
      invitationId: invitation.id,
      invitedEmail: invitation.email,
      invitedRole: invitation.role,
      issuedByUserId: session.user.id,
      issuedByName: session.user.name,
      issuedByEmail: session.user.email,
      ipAddress: request.headers.get('x-forwarded-for') || '127.0.0.1',
    });

    return Response.json(
      {
        message: 'ส่งคำเชิญสำเร็จ',
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งคำเชิญ', { defaultStatus: 400 });
  }
}
