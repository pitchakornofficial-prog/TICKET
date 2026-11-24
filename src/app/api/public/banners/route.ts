import { getDatabasePool } from '@/server/database';
import { readHomeBanners } from '@/server/home-banners';
import { createSafeErrorResponse } from '@/server/api-error';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const pool = getDatabasePool();
    const banners = await readHomeBanners(pool);

    return Response.json(
      { banners },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15',
        },
      },
    );
  } catch (error) {
    return createSafeErrorResponse(error, 'โหลดข้อมูลแบนเนอร์ไม่สำเร็จ', { defaultStatus: 500 });
  }
}
