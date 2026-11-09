import { Suspense } from 'react';
import { getDatabasePool } from '@/server/database';
import { listPublicEvents, type PublicEventSummary } from '@/server/events';
import { HomeConcertCatalog } from '@/components/home-concert-catalog';
import { HomeCatalogSkeleton } from '@/components/home-catalog-skeleton';

export const metadata = {
  title: 'TICKET — บัตรคอนเสิร์ต',
  description: 'แพลตฟอร์มจำหน่ายบัตรคอนเสิร์ตในประเทศไทย ซื้อบัตรได้โดยไม่สมัครสมาชิก',
};

async function AsyncHomeCatalog({ q }: { q?: string }) {
  let allEvents: PublicEventSummary[] = [];

  try {
    const pool = getDatabasePool();
    // Load all public approved events for instant in-memory client filtering
    allEvents = await listPublicEvents(pool);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.warn('Unable to query public events:', error);
    }
  }

  return <HomeConcertCatalog allEvents={allEvents} initialQuery={q} />;
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
