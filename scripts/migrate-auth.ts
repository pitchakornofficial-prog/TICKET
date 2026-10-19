import { createDatabasePool } from '../src/server/database.ts';
import { migrateAuth } from '../src/server/auth-migration.ts';

const pool = createDatabasePool();
try {
  await migrateAuth(pool);
  console.log('Auth schema ready');
} catch {
  console.error('Auth migration failed; check local PostgreSQL and migration configuration');
  process.exitCode = 1;
} finally { await pool.end(); }
