import { getDatabasePool } from '@/server/database';
import { createSafeErrorResponse } from '@/server/api-error';
import { readTicketMasterTemplate } from '@/server/ticket-master-template';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const template = await readTicketMasterTemplate(getDatabasePool());
    return Response.json(
      { template },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
        },
      },
    );
  } catch (error) {
    return createSafeErrorResponse(error, 'โหลดแบบบัตรหลักไม่สำเร็จ', { defaultStatus: 500 });
  }
}
