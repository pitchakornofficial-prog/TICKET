import { getDatabasePool } from '@/server/database';
import { listPublicEvents, type PublicEventSummary } from '@/server/events';
import { HomeConcertCatalog } from '@/components/home-concert-catalog';

export const metadata = {
  title: 'TICKET — บัตรคอนเสิร์ต',
  description: 'แพลตฟอร์มจำหน่ายบัตรคอนเสิร์ตในประเทศไทย ซื้อบัตรได้โดยไม่สมัครสมาชิก',
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
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
