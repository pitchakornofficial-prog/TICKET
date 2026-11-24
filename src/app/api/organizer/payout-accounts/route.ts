export const runtime = 'nodejs';

import { createSafeErrorResponse } from '@/server/api-error.ts';
import { getAuth } from '@/server/auth.ts';
import { assertSameOrigin } from '@/server/origin.ts';
import {
  getOrganizerPayoutAccounts,
  createOrganizerPayoutAccount,
  updateOrganizerPayoutAccount,
  deleteOrganizerPayoutAccount,
} from '@/server/organizer-finance.ts';
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
    const accounts = await getOrganizerPayoutAccounts(pool, targetOrganizerId);
    return Response.json(
      { accounts },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีรับเงิน', { defaultStatus: 500 });
  }
}

export async function POST(request: Request) {
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
      accountName?: string;
      accountNumber?: string;
      bankName?: string;
      isPrimary?: boolean;
      qrCodeUrl?: string;
      organizerId?: string;
    };

    const targetOrganizerId =
      session.user.role === 'owner' && body.organizerId ? body.organizerId : session.user.id;

    const account = await createOrganizerPayoutAccount(pool, targetOrganizerId, {
      accountName: body.accountName || '',
      accountNumber: body.accountNumber || '',
      bankName: body.bankName || '',
      isPrimary: body.isPrimary,
      qrCodeUrl: body.qrCodeUrl,
    });

    return Response.json({ account, message: 'เพิ่มบัญชีรับเงินเรียบร้อยแล้ว' }, { status: 201 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการเพิ่มบัญชีรับเงิน', { defaultStatus: 400 });
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
      id?: string;
      accountName?: string;
      accountNumber?: string;
      bankName?: string;
      isPrimary?: boolean;
      qrCodeUrl?: string;
      organizerId?: string;
    };

    if (!body.id) {
      return Response.json({ message: 'ต้องระบุรหัสบัญชีที่ต้องการแก้ไข' }, { status: 400 });
    }

    const targetOrganizerId =
      session.user.role === 'owner' && body.organizerId ? body.organizerId : session.user.id;

    const account = await updateOrganizerPayoutAccount(pool, targetOrganizerId, body.id, {
      accountName: body.accountName,
      accountNumber: body.accountNumber,
      bankName: body.bankName,
      isPrimary: body.isPrimary,
      qrCodeUrl: body.qrCodeUrl,
    });

    return Response.json({ account, message: 'อัปเดตบัญชีรับเงินเรียบร้อยแล้ว' }, { status: 200 });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการแก้ไขบัญชีรับเงิน', { defaultStatus: 400 });
  }
}

export async function DELETE(request: Request) {
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
    const { searchParams } = new URL(request.url, 'http://localhost');
    const accountId = searchParams.get('id');

    if (!accountId) {
      return Response.json({ message: 'ต้องระบุรหัสบัญชีที่ต้องการลบ' }, { status: 400 });
    }

    const reqOrgId = searchParams.get('organizerId');
    const targetOrganizerId =
      session.user.role === 'owner' && reqOrgId ? reqOrgId : session.user.id;

    const result = await deleteOrganizerPayoutAccount(pool, targetOrganizerId, accountId);
    return Response.json(
      { message: 'ลบบัญชีรับเงินเรียบร้อยแล้ว', nextPrimaryId: result.nextPrimaryId },
      { status: 200 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการลบบัญชีรับเงิน', { defaultStatus: 400 });
  }
}
