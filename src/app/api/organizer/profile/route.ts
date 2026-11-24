export const runtime = 'nodejs';

import { createSafeErrorResponse } from '@/server/api-error.ts';
import { getAuth } from '@/server/auth.ts';
import { assertSameOrigin } from '@/server/origin.ts';
import { getOrganizerProfile, updateOrganizerProfile } from '@/server/organizer-finance.ts';
import type { Pool } from 'pg';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนเข้าถึงข้อมูล' }, { status: 401 });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  const { searchParams } = new URL(request.url, 'http://localhost');
  const reqOrgId = searchParams.get('organizerId');
  const targetOrganizerId =
    session.user.role === 'owner' && reqOrgId ? reqOrgId : session.user.id;

  try {
    const profile = await getOrganizerProfile(pool, targetOrganizerId);
    return Response.json(
      { profile },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงข้อมูลโปรไฟล์ผู้จัดงาน', { defaultStatus: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);

    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
    }

    if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
      return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
    }

    const pool = auth.options.database as Pool;
    const body = (await request.json().catch(() => ({}))) as {
      organizerName?: string;
      primaryPhone?: string;
      backupContactName?: string;
      backupPhone?: string;
      organizerId?: string;
    };

    const targetOrganizerId =
      session.user.role === 'owner' && body.organizerId ? body.organizerId : session.user.id;

    const profile = await updateOrganizerProfile(pool, targetOrganizerId, {
      organizerName: body.organizerName,
      primaryPhone: body.primaryPhone,
      backupContactName: body.backupContactName,
      backupPhone: body.backupPhone,
    });

    return Response.json({ profile, message: 'บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว' }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการบันทึกข้อมูลโปรไฟล์', { defaultStatus: 400 });
  }
}
