import { createDatabasePool } from '../src/server/database.ts';
import { migrateAuth } from '../src/server/auth-migration.ts';
import { ensureFeeSchema } from '../src/server/fees.ts';
import { ensureQueueSchema } from '../src/server/queue.ts';
import { ensureGuestOtpSchema } from '../src/server/guest-otp.ts';
import { ensureReservationSchema } from '../src/server/reservation.ts';

const pool = createDatabasePool();
try {
  console.log('Starting migration and schema verification...');
  await migrateAuth(pool);
  console.log('1. Auth schema: OK');
  await ensureFeeSchema(pool);
  console.log('2. Fee schema: OK');
  await ensureQueueSchema(pool);
  console.log('3. Queue schema: OK');
  await ensureGuestOtpSchema(pool);
  console.log('4. Guest OTP schema & atomic functions: OK');
  await ensureReservationSchema(pool);
  console.log('5. Reservation schema, triggers, and atomic functions: OK');

  // Verify backfill consistency
  const expectedRes = await pool.query<{ ticketTypeId: string; expected: number }>(`
    SELECT oi."ticketTypeId", SUM(oi.quantity)::int AS expected
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    WHERE o.status = 'paid'
    GROUP BY oi."ticketTypeId"
    ORDER BY oi."ticketTypeId"
  `);

  const actualRes = await pool.query<{ ticketTypeId: string; actual: number }>(`
    SELECT "ticketTypeId", SUM(qty)::int AS actual
    FROM ticket_type_paid_buckets
    GROUP BY "ticketTypeId"
    ORDER BY "ticketTypeId"
  `);

  const actualMap = new Map(actualRes.rows.map(r => [r.ticketTypeId, r.actual]));
  let mismatchCount = 0;
  for (const exp of expectedRes.rows) {
    const act = actualMap.get(exp.ticketTypeId) ?? 0;
    if (act !== exp.expected) {
      console.error(`Mismatch for ticketTypeId ${exp.ticketTypeId}: expected ${exp.expected}, got ${act}`);
      mismatchCount++;
    }
  }

  const expectedMap = new Map(expectedRes.rows.map(r => [r.ticketTypeId, r.expected]));
  for (const act of actualRes.rows) {
    const exp = expectedMap.get(act.ticketTypeId) ?? 0;
    if (exp !== act.actual) {
      console.error(`Mismatch for ticketTypeId ${act.ticketTypeId}: expected ${exp}, got ${act.actual}`);
      mismatchCount++;
    }
  }

  if (mismatchCount > 0) {
    throw new Error(`Bucket backfill validation failed with ${mismatchCount} mismatches`);
  }

  console.log(`6. Paid buckets backfill validated successfully (${expectedRes.rows.length} ticket types verified).`);
  console.log('Migration and schema verification completed successfully.');
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
