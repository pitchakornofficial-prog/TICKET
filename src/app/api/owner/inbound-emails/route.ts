import { createSafeErrorResponse } from '@/server/api-error';
import { getAuth } from '@/server/auth';
import { getDatabasePool } from '@/server/database';
import {
  type InboundEmailStatus,
  listInboundEmails,
} from '@/server/inbound-email';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set(['all', 'unread', 'read', 'replied', 'archived']);

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'owner') {
    return Response.json({ message: 'ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status') || 'all';
    const status = VALID_STATUSES.has(statusParam)
      ? (statusParam as InboundEmailStatus | 'all')
      : 'all';
    const recipient = url.searchParams.get('recipient') || 'all';
    const q = url.searchParams.get('q') || '';

    const data = await listInboundEmails(getDatabasePool(), {
      status,
      recipient,
      q,
    });

    return Response.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    });
  } catch (error) {
    return createSafeErrorResponse(error, 'ไม่สามารถโหลดกล่องจดหมายขาเข้าได้', {
      defaultStatus: 500,
    });
  }
}
