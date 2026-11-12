import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { syncOfflineAdmissionScans } from '@/server/admission';
import { verifyScannerSessionEventScope } from '@/server/scanner-scope';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return Response.json({ message: 'ไม่อนุญาต: กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const { role, id, name } = session.user;
  if (role !== 'scanner') {
    return Response.json(
      { message: 'ไม่อนุญาต: เฉพาะเครื่องหลักประจำงานเท่านั้นที่สามารถซิงก์ข้อมูลออฟไลน์ได้' },
      { status: 403 },
    );
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const secret =
      process.env.BETTER_AUTH_SECRET || (auth.options as { secret: string }).secret;
    const scopeCheck = await verifyScannerSessionEventScope(
      pool,
      role,
      request.headers.get('cookie'),
      secret,
      { eventId, scannerId: id },
    );
    if (!scopeCheck.allowed) {
      return Response.json({ message: scopeCheck.reason }, { status: 403 });
    }

    const body = await request.json();
    const scans = Array.isArray(body?.scans) ? body.scans : [];

    const result = await syncOfflineAdmissionScans(
      pool,
      { id, role, name },
      eventId,
      { scans },
    );

    return Response.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการซิงก์ข้อมูลออฟไลน์', {
      defaultStatus: 500,
      statusResolver: (msg) => (msg.includes('ไม่อนุญาต') ? 403 : 500),
    });
  }
}
