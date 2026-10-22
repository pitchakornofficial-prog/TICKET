import { getAuth } from '@/server/auth';
import { getPayoutProof } from '@/server/reports';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return new Response('Unauthorized: กรุณาเข้าสู่ระบบก่อนเข้าถึงไฟล์หลักฐาน', {
      status: 401,
    });
  }

  if (session.user.role !== 'owner') {
    return new Response('Forbidden: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์ดูไฟล์หลักฐานการโอนเงิน (AC-92)', {
      status: 403,
    });
  }

  const { id: payoutId } = await params;
  const pool = auth.options.database as Pool;

  try {
    const result = await getPayoutProof(pool, {
      payoutId,
      actorRole: session.user.role,
    });

    if (!result.success || !result.data) {
      const status = result.code === 'FORBIDDEN' ? 403 : 404;
      return new Response(result.error || 'Not found', { status });
    }

    return new Response(new Uint8Array(result.data), {
      status: 200,
      headers: {
        'Content-Type': result.contentType || 'application/octet-stream',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return new Response('Internal server error', { status: 500 });
  }
}
