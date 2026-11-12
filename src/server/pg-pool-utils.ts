import type { Pool } from 'pg';

/**
 * Distinguishes real `pg.Pool` instances from minimal mock objects used in unit tests.
 */
export function isRealPgPool(pool: Pool | null | undefined): pool is Pool {
  return Boolean(
    pool &&
      typeof (pool as unknown as { end?: unknown }).end === 'function' &&
      typeof (pool as unknown as { totalCount?: unknown }).totalCount === 'number',
  );
}
