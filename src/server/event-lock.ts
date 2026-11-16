import type { PoolClient } from 'pg';

export const EVENT_FEE_RESERVATION_LOCK_NAMESPACE = 781204113;
export const EVENT_FINANCIAL_LOCK_NAMESPACE = 781204114;

export async function lockEventFeeReservation(client: Pick<PoolClient, 'query'>, eventId: string): Promise<void> {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), $2::int)',
    [eventId, EVENT_FEE_RESERVATION_LOCK_NAMESPACE],
  );
}

export async function lockEventFinancial(client: Pick<PoolClient, 'query'>, eventId: string): Promise<void> {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), $2::int)',
    [eventId, EVENT_FINANCIAL_LOCK_NAMESPACE],
  );
}
