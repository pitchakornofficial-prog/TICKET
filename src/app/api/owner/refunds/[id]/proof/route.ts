import { headers } from 'next/headers';
import { getAuth, readActor } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import { getRefundTransferProof } from '@/server/refunds';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await readActor(getAuth(), await headers());

    // AC-92: Only owner can download or access refund proof files
    if (actor?.role !== 'owner') {
      return new Response('Forbidden: เฉพาะเจ้าของเว็บ (Owner) เท่านั้นที่มีสิทธิ์ดูไฟล์หลักฐานการโอนเงิน (AC-92)', {
        status: 403,
      });
    }

    const result = await getRefundTransferProof(getDatabasePool(), {
      refundRequestId: id,
      actorRole: actor.role,
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
