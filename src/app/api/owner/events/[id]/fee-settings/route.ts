import { getAuth } from '@/server/auth';
import { getEventFeeSettings, saveEventFeeSettings, type FeeSettingsInput } from '@/server/fees';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;
  try {
    const feeSettings = await getEventFeeSettings(pool, eventId);
    return Response.json({ feeSettings }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return Response.json({ message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;

  let body: Partial<FeeSettingsInput> = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    !body.organizerFeeMode ||
    body.organizerFeeRate == null ||
    !body.customerFeeMode ||
    body.customerFeeRate == null ||
    body.reservePercentage == null
  ) {
    return Response.json({ message: 'กรุณาระบุข้อมูลค่าบริการและเงินสำรองให้ครบถ้วน' }, { status: 400 });
  }

  const pool = auth.options.database as Pool;
  try {
    const feeSettings = await saveEventFeeSettings(
      pool,
      eventId,
      {
        organizerFeeMode: body.organizerFeeMode,
        organizerFeeRate: Number(body.organizerFeeRate),
        customerFeeMode: body.customerFeeMode,
        customerFeeRate: Number(body.customerFeeRate),
        reservePercentage: Number(body.reservePercentage),
      },
      session.user.id,
    );
    return Response.json({ message: 'บันทึกค่าบริการและเงินสำรองสำเร็จ', feeSettings }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return Response.json({ message }, { status: 400 });
  }
}
