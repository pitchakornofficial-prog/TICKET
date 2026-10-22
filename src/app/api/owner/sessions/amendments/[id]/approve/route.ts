import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { approveSessionAmendment } from '@/server/events';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await readActor(getAuth(), await headers());

    if (actor?.role !== 'owner') {
      return Response.json(
        { message: 'เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์อนุมัติการแก้ไขรอบการแสดง (AC-67)' },
        { status: 403 },
      );
    }

    let specialRefundWindowStart: string | null = null;
    let specialRefundWindowEnd: string | null = null;
    try {
      const body = await request.json();
      specialRefundWindowStart = body.specialRefundWindowStart || null;
      specialRefundWindowEnd = body.specialRefundWindowEnd || null;
    } catch {
      // Empty or non-JSON body is valid
    }

    const result = await approveSessionAmendment(getDatabasePool(), {
      amendmentId: id,
      ownerId: actor.id,
      specialRefundWindowStart,
      specialRefundWindowEnd,
    });

    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการอนุมัติการแก้ไขรอบการแสดง';
    return Response.json({ message }, { status: 400 });
  }
}
