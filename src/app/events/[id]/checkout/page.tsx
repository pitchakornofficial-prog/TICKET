import { notFound } from 'next/navigation';
import { getDatabasePool } from '@/server/database';
import { getPublicEventWithApprovedSessions } from '@/server/events';
import { EventCheckoutFlow } from '@/components/event-checkout-flow';

interface EventCheckoutPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventCheckoutPage({ params }: EventCheckoutPageProps) {
  const { id } = await params;
  let event = null;

  try {
    const pool = getDatabasePool();
    event = await getPublicEventWithApprovedSessions(pool, id);
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.error('Error fetching event for checkout:', error);
    }
  }

  if (!event) {
    notFound();
  }

  return (
    <EventCheckoutFlow
      eventId={event.id}
      eventTitle={event.title}
      eventLocation={event.location}
      limitPerOrder={event.limitPerOrder}
      sessions={event.sessions || []}
    />
  );
}
