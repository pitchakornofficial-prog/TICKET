import { createDatabasePool } from '../src/server/database.ts';

const pool = createDatabasePool();
try {
  await pool.query('SELECT 1');
  console.log('Local PostgreSQL connection ready');
} catch {
  console.error('PostgreSQL connection failed; check DATABASE_URL and db:up');
  process.exitCode = 1;
} finally {
  await pool.end();
}
