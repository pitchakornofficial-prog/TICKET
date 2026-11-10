import { Pool, type PoolClient } from 'pg';

export function createDatabasePool(
  connectionString = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL,
): Pool {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  const maxPoolSize = process.env.DATABASE_POOL_MAX
    ? parseInt(process.env.DATABASE_POOL_MAX, 10)
    : 25;
  return new Pool({
    connectionString,
    max: maxPoolSize,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
  });
}

let sharedPool: Pool | undefined;

export function setDatabasePool(pool: Pool | undefined): void {
  sharedPool = pool;
}

export function getDatabasePool(): Pool {
  if (!sharedPool) {
    sharedPool = createDatabasePool();
  }
  return sharedPool;
}

// Every statement of a transaction uses the same checked-out connection.
export async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (typeof pool?.connect !== 'function') {
    return await work(pool as unknown as PoolClient);
  }
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
