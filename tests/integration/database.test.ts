import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createDatabasePool, inTransaction } from '../../src/server/database';
import { testDatabaseUrl } from '../support/test-database';

describe('shared PostgreSQL transaction boundary (AC-105 prerequisite only)', () => {
  let writer: Pool;
  let reader: Pool;
  const schema = `foundation_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    const url = testDatabaseUrl();
    writer = createDatabasePool(url);
    reader = createDatabasePool(url);
    await writer.query(`CREATE SCHEMA "${schema}"`);
    await writer.query(`CREATE TABLE "${schema}".probe (id text PRIMARY KEY, value text NOT NULL)`);
  });
  afterAll(async () => {
    try { if (writer) await writer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await Promise.all([writer?.end(), reader?.end()]); }
  });

  it('another connection sees committed records but cannot see uncommitted writes', async () => {
    const a = await writer.query('SELECT pg_backend_pid() AS pid');
    const b = await reader.query('SELECT pg_backend_pid() AS pid');
    expect(a.rows[0].pid).not.toBe(b.rows[0].pid);
    const result = await inTransaction(writer, async client => {
      await client.query(`INSERT INTO "${schema}".probe VALUES ($1, $2)`, ['committed', 'shared-store']);
      const pending = await reader.query(`SELECT * FROM "${schema}".probe WHERE id=$1`, ['committed']);
      expect(pending.rowCount).toBe(0);
      return 'saved';
    });
    expect(result).toBe('saved');
    const saved = await reader.query(`SELECT value FROM "${schema}".probe WHERE id=$1`, ['committed']);
    expect(saved.rows).toEqual([{ value: 'shared-store' }]);
  });

  it('rolls back every write after a SQL error and leaves the pool usable', async () => {
    await expect(inTransaction(writer, async client => {
      await client.query(`INSERT INTO "${schema}".probe VALUES ($1, $2)`, ['rollback', 'must-not-persist']);
      await client.query(`INSERT INTO "${schema}".probe VALUES ($1, $2)`, ['rollback', 'duplicate']);
    })).rejects.toMatchObject({ code: '23505' });
    const result = await reader.query(`SELECT * FROM "${schema}".probe WHERE id=$1`, ['rollback']);
    expect(result.rows).toEqual([]);
    await inTransaction(writer, async client => {
      await client.query(`INSERT INTO "${schema}".probe VALUES ($1, $2)`, ['after-failure', 'usable']);
    });
    expect((await reader.query(`SELECT value FROM "${schema}".probe WHERE id=$1`, ['after-failure'])).rows)
      .toEqual([{ value: 'usable' }]);
  });
});
