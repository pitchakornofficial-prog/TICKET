import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import { getDatabasePool } from '@/server/database';
import {
  queryPublicEventsCatalog,
  type PublicEventCatalogResult,
} from '@/server/events';
import { HomeConcertCatalog } from '@/components/home-concert-catalog';
import { HomeCatalogSkeleton } from '@/components/home-catalog-skeleton';

export const metadata = {
  title: 'TICKET — บัตรคอนเสิร์ต',
  description: 'แพลตฟอร์มจำหน่ายบัตรคอนเสิร์ตในประเทศไทย ซื้อบัตรได้โดยไม่สมัครสมาชิก',
};

const INITIAL_CATALOG_PAGE_SIZE = 12;

const getCachedDefaultCatalog = unstable_cache(
  async () => {
    const pool = getDatabasePool();
    return queryPublicEventsCatalog(pool, {
      page: 1,
      limit: INITIAL_CATALOG_PAGE_SIZE,
      includeLocations: true,
    });
  },
  ['home-public-events-catalog'],
  { revalidate: 30, tags: ['public-events'] },
);

async function AsyncHomeCatalog({ q }: { q?: string }) {
  let initialCatalog: PublicEventCatalogResult = {
    events: [],
    totalCount: 0,
    page: 1,
    limit: INITIAL_CATALOG_PAGE_SIZE,
    hasMore: false,
    locations: [],
  };

  try {
    if (q?.trim()) {
      const pool = getDatabasePool();
      // Filter and paginate server-side without shipping descriptions in RSC payload
      initialCatalog = await queryPublicEventsCatalog(pool, {
        q,
        page: 1,
        limit: INITIAL_CATALOG_PAGE_SIZE,
        includeLocations: true,
      });
    } else {
      initialCatalog = await getCachedDefaultCatalog();
    }
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.warn('Unable to query public events:', error);
    }
  }

  return (
    <HomeConcertCatalog
      allEvents={initialCatalog.events}
      initialTotalCount={initialCatalog.totalCount}
      initialHasMore={initialCatalog.hasMore}
      initialLocations={initialCatalog.locations}
      serverCatalogEnabled
      initialQuery={q}
    />
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <Suspense fallback={<HomeCatalogSkeleton />}>
      <AsyncHomeCatalog q={q} />
    </Suspense>
  );
}
