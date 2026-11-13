import { getDatabasePool } from '@/server/database';
import { queryPublicEventsCatalog } from '@/server/events';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || undefined;
  const tab = (searchParams.get('tab') as 'all' | 'available' | 'upcoming' | null) || undefined;
  const location = searchParams.get('location') || undefined;
  const priceRange =
    (searchParams.get('priceRange') as
      | 'all'
      | 'under1500'
      | '1500to3000'
      | 'above3000'
      | null) || undefined;
  const availability =
    (searchParams.get('availability') as 'all' | 'available' | 'upcoming' | null) || undefined;
  const sort =
    (searchParams.get('sort') as 'date_asc' | 'price_asc' | 'price_desc' | null) || undefined;
  const pageParam = searchParams.get('page');
  const limitParam = searchParams.get('limit');
  const page = pageParam ? Number.parseInt(pageParam, 10) : 1;
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 12;
  const includeLocations = searchParams.get('includeLocations') === 'true';

  const pool = getDatabasePool();
  const result = await queryPublicEventsCatalog(pool, {
    q,
    tab,
    location,
    priceRange,
    availability,
    sort,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 12,
    includeLocations,
  });

  return Response.json(result, {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=30' },
  });
}
