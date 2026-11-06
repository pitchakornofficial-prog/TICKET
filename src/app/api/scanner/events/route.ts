import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { listEventsForScanner } from '@/server/events';
import { resolveScannerSessionScope } from '@/server/scanner-scope';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || !['scanner', 'organizer', 'owner'].includes(session.user.role)) {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะทีมงานที่ได้รับสิทธิ์เท่านั้น' }, { status: 403 });
  }

  const pool = auth.options.database as Pool;
  try {
    let events = await listEventsForScanner(pool, session.user.id, session.user.role);

    // If scanner session is constrained to a specific event scope, filter out other events (Issue #3)
    if (session.user.role === 'scanner') {
      const secret = process.env.BETTER_AUTH_SECRET || (auth.options as { secret: string }).secret;
      const scopeResolution = await resolveScannerSessionScope(
        pool,
        request.headers.get('cookie'),
        secret,
      );

      if (scopeResolution.status === 'error') {
        return Response.json(
          { message: scopeResolution.reason },
          { status: scopeResolution.statusCode },
        );
      }

      if (scopeResolution.status === 'scoped') {
        events = events.filter((e) => e.id === scopeResolution.eventId);
      }
    }

    return Response.json(
      {
        events,
        currentScanner: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return createSafeErrorResponse(error, 'เกิดข้อผิดพลาดในการดึงรายการงานที่ได้รับมอบหมาย', { defaultStatus: 500 });
  }
}
