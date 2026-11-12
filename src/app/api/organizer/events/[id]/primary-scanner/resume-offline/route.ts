import { createSafeErrorResponse } from '@/server/api-error';
import { assertSameOrigin } from '@/server/origin';
import { getAuth } from '@/server/auth';
import { resumeOfflineAdmissionAfterReconciliation } from '@/server/primary-scanner';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
  }

  if (session.user.role !== 'organizer' && session.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะผู้จัดงานหรือผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  }

  const { id: eventId } = await params;
  let body: { notes?: string } = {};

  try {
    body = await request.json();
  } catch {
    // Body optional
  }

  const pool = auth.options.database as Pool;

  try {
    const control = await resumeOfflineAdmissionAfterReconciliation(
      pool,
      { id: session.user.id, role: session.user.role, name: session.user.name },
      eventId,
      {
        notes: body.notes,
      },
    );

    return Response.json(
      {
        message: 'กระทบยอดเสร็จสิ้น ปลดระงับและเปิดให้ตั้งเครื่องหลักใหม่เรียบร้อยแล้ว',
        control,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการปลดระงับ', {
      defaultStatus: 400,
      statusResolver: (msg) => msg.includes('ไม่อนุญาต') ? 403 : msg.includes('ไม่พบ') ? 404 : 400,
    });
  }
}
