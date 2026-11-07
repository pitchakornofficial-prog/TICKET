import { notFound } from 'next/navigation';
import { getDatabasePool } from '@/server/database';
import { getPublicEventWithApprovedSessions } from '@/server/events';
import { getEventFeeSettings } from '@/server/fees';
import { EventCheckoutFlow } from '@/components/event-checkout-flow';

interface EventCheckoutPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventCheckoutPage({ params }: EventCheckoutPageProps) {
  const { id } = await params;
  let event = null;
  let feeSettings = null;

  try {
    const pool = getDatabasePool();
    const [ev, fees] = await Promise.all([
      getPublicEventWithApprovedSessions(pool, id),
      getEventFeeSettings(pool, id),
    ]);
    event = ev;
    feeSettings = fees;
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
      eventPosterUrl={event.posterUrl}
      limitPerOrder={event.limitPerOrder}
      sessions={event.sessions || []}
      feeSettings={
        feeSettings
          ? {
              customerFeeMode: feeSettings.customerFeeMode,
              customerFeeRate: feeSettings.customerFeeRate,
              ubuPrivilegeMode: feeSettings.ubuPrivilegeMode,
              organizerFeePrivilegeRate: feeSettings.organizerFeePrivilegeRate,
            }
          : undefined
      }
    />
  );
}
