import { createDatabasePool } from '../src/server/database.ts';
import { ensureEventSchema, seedUbuFreshyFest } from '../src/server/events.ts';

// D-185: Back-Office Data Integrity Reset
// Preserves only owner@ticket.local and organizer.freshy@ubu.ac.th
// Preserves only event-ubu-freshy-2026 ("UBU Freshy Music Fest 2026")
// Cleans all unrelated users, events, sessions, tickets, orders, payouts, and notifications
async function resetBackOfficeData(): Promise<void> {
  const pool = createDatabasePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure schemas exist
    await ensureEventSchema(pool);
    await seedUbuFreshyFest(pool);

    const keepEventIds = [
      'event-ubu-freshy-2026',
      'event-ubu-acoustic-2026',
      'event-ubu-isan-indy-2026',
      'event-ubu-countdown-2026',
    ];

    // 2. Clean refund items and refund requests for non-UBU orders
    await client.query(
      `DELETE FROM refund_request_items 
       WHERE "refundRequestId" IN (
         SELECT rr.id FROM refund_requests rr
         JOIN orders o ON rr."orderId" = o.id
         WHERE NOT (o."eventId" = ANY($1::text[]))
       )`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM refund_requests 
       WHERE "orderId" IN (SELECT id FROM orders WHERE NOT ("eventId" = ANY($1::text[])))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM refund_liabilities WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM ticket_admission_logs WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM admission_sync_conflicts WHERE "eventId" IS NOT NULL AND NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM ticket_email_deliveries 
       WHERE "orderId" IN (SELECT id FROM orders WHERE NOT ("eventId" = ANY($1::text[])))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM order_contact_audit_logs 
       WHERE "orderId" IN (SELECT id FROM orders WHERE NOT ("eventId" = ANY($1::text[])))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM tickets WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM order_items 
       WHERE "orderId" IN (SELECT id FROM orders WHERE NOT ("eventId" = ANY($1::text[])))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM orders WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM event_payouts WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM event_debt_repayments WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM event_reserve_releases WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM event_fee_settings WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM event_scanners WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM event_primary_scanners WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM event_offline_controls WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM primary_scanner_handovers WHERE "eventId" IS NOT NULL AND NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM scanner_dataset_syncs WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM session_amendments 
       WHERE "sessionId" IN (SELECT id FROM event_sessions WHERE NOT ("eventId" = ANY($1::text[])))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM session_cancellations 
       WHERE "sessionId" IN (SELECT id FROM event_sessions WHERE NOT ("eventId" = ANY($1::text[])))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM ticket_types 
       WHERE "sessionId" IN (SELECT id FROM event_sessions WHERE NOT ("eventId" = ANY($1::text[])))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM event_sessions WHERE NOT ("eventId" = ANY($1::text[]))`,
      [keepEventIds],
    ).catch(() => {});

    await client.query(
      `DELETE FROM events WHERE NOT (id = ANY($1::text[]))`,
      [keepEventIds],
    );

    // 3. Clean users except owner and UBU organizer
    const keepEmails = ['owner@ticket.local', 'organizer.freshy@ubu.ac.th'];

    await client.query(
      `DELETE FROM auth_session 
       WHERE "userId" IN (SELECT id FROM auth_user WHERE email NOT IN ($1, $2))`,
      keepEmails,
    ).catch(() => {});

    await client.query(
      `DELETE FROM auth_account 
       WHERE "userId" IN (SELECT id FROM auth_user WHERE email NOT IN ($1, $2))`,
      keepEmails,
    ).catch(() => {});

    await client.query(
      `DELETE FROM organizer_invitations 
       WHERE email NOT IN ($1, $2)`,
      keepEmails,
    ).catch(() => {});

    await client.query(
      `DELETE FROM news 
       WHERE "authorId" IN (SELECT id FROM auth_user WHERE email NOT IN ($1, $2))`,
      keepEmails,
    ).catch(() => {});

    await client.query(
      `DELETE FROM auth_user 
       WHERE email NOT IN ($1, $2)`,
      keepEmails,
    );

    await client.query('COMMIT');
    console.log('Successfully reset back-office data for D-185: Owner and UBU Freshy preserved only.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reset back-office data failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await resetBackOfficeData();
