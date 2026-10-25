import { notFound } from 'next/navigation';
import { getDatabasePool } from '@/server/database';
import { getPublicEventWithApprovedSessions } from '@/server/events';
import { QueueWaitingRoom } from '@/components/queue-waiting-room';

interface EventQueuePageProps {
  params: Promise<{ id: string }>;
}

export default async function EventQueuePage({ params }: EventQueuePageProps) {
  const { id } = await params;
  let event = null;

  try {
    const pool = getDatabasePool();
    event = await getPublicEventWithApprovedSessions(pool, id);
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code !== 'ECONNREFUSED') {
      console.error('Error fetching event for queue:', error);
    }
  }

  if (!event) {
    notFound();
  }

  return (
    <QueueWaitingRoom
      eventId={event.id}
      eventTitle={event.title}
      eventLocation={event.location}
    />
  );
}
