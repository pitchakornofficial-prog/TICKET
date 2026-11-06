import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getOfflineDataset } from '@/server/primary-scanner';
import { verifyScannerSessionEventScope } from '@/server/scanner-scope';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }, { status: 401 });
  }

  const { id: eventId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const secret =
      process.env.BETTER_AUTH_SECRET || (auth.options as { secret: string }).secret;
    const scopeCheck = await verifyScannerSessionEventScope(
      pool,
      session.user.role,
      request.headers.get('cookie'),
      secret,
      { eventId, scannerId: session.user.id },
    );
    if (!scopeCheck.allowed) {
      return Response.json({ message: scopeCheck.reason }, { status: 403 });
    }

    const dataset = await getOfflineDataset(
      pool,
      { id: session.user.id, role: session.user.role },
      eventId,
    );
    return Response.json(dataset, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงชุดข้อมูลออฟไลน์', {
      defaultStatus: 400,
      statusResolver: (msg) => (msg.includes('ไม่อนุญาต') ? 403 : msg.includes('ไม่พบ') ? 404 : 400),
    });
  }
}
