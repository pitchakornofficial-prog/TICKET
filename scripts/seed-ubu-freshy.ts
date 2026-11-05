import { createDatabasePool } from '../src/server/database.ts';
import { ensureEventSchema, seedUbuFreshyFest } from '../src/server/events.ts';

// One-time seed for the UBU club account and event (D-185). Never called automatically.
const pool = createDatabasePool();
try {
  await ensureEventSchema(pool);
  await seedUbuFreshyFest(pool);
  console.log('seeded organizer.freshy@ubu.ac.th and event-ubu-freshy-2026');
} finally {
  await pool.end();
}
