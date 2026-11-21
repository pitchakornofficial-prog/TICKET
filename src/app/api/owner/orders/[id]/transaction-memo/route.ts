import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { readBoundedJson } from '@/server/upload-quota';
import {
  saveOrderTransactionMemo,
  getOrderTransactionMemos,
  getOrderItemsForOrder,
  type TransactionVerificationStatus,
} from '@/server/transaction-memo';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id: orderId } = await params;
  const actor = await readActor(getAuth(), await headers());

  if (!actor) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  // D-276 Role check: Only owner is authorized
  if (actor.role !== 'owner') {
    return Response.json(
      { message: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์บันทึกข้อมูลธุรกรรมคำสั่งซื้อ' },
      { status: 403 },
    );
  }

  let body: {
    transferRef?: unknown;
    verificationStatus?: unknown;
    adminNotes?: unknown;
  };
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as typeof body;
  } catch (error) {
    const status = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return Response.json({ message: 'ข้อมูลธุรกรรมไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' }, { status });
  }

  try {
    const { transferRef, verificationStatus, adminNotes } = body || {};

    const pool = getDatabasePool();
    const result = await saveOrderTransactionMemo(pool, {
      orderId,
      transferRef: String(transferRef || ''),
      verificationStatus: (verificationStatus as TransactionVerificationStatus) || 'verified',
      adminNotes: typeof adminNotes === 'string' ? adminNotes : '',
      actor,
    });

    if (!result.success) {
      const status =
        result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;

      return Response.json({ message: result.error, code: result.code }, { status });
    }

    return Response.json(
      { success: true, memo: result.memo },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการบันทึกข้อมูลธุรกรรม', { defaultStatus: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const actor = await readActor(getAuth(), await headers());

  if (!actor) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  if (actor.role !== 'owner') {
    return Response.json(
      { message: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่มีสิทธิ์ดูข้อมูลธุรกรรมคำสั่งซื้อ' },
      { status: 403 },
    );
  }

  try {
    const pool = getDatabasePool();
    const [memos, items] = await Promise.all([
      getOrderTransactionMemos(pool, orderId),
      getOrderItemsForOrder(pool, orderId),
    ]);

    return Response.json(
      { memos, items },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงข้อมูลธุรกรรม', { defaultStatus: 500 });
  }
}
