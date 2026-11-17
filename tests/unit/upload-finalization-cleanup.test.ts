import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { persistUploadFinalizeIntent } from '../../src/server/upload-finalization';

describe('expired pending upload cleanup', () => {
  it('deletes expired intent rows and best-effort deletes their pending storage objects', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('DELETE FROM upload_finalize_intents')) {
        return {
          rows: [
            { uploadKey: 'pending/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg' },
            { uploadKey: 'pending/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png' },
            { uploadKey: 'posters/cccccccc-cccc-cccc-cccc-cccccccccccc.png' },
          ],
          rowCount: 3,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const pool = { query } as unknown as Pool;
    const deleteObject = vi.fn(async (key: string) => {
      if (key.includes('aaaaaaaa')) throw new Error('storage temporarily unavailable');
    });

    await expect(persistUploadFinalizeIntent(pool, {
      intentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      actorId: 'user-1',
      uploadKey: 'pending/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg',
      key: 'posters/ffffffff-ffff-ffff-ffff-ffffffffffff.jpg',
      contentType: 'image/jpeg',
      visibility: 'public',
      maxFileSizeBytes: 1024,
      expiresAt: Date.now() + 60_000,
    }, { delete: deleteObject })).resolves.toBeUndefined();

    const deleteQuery = query.mock.calls.find(([sql]) => sql.includes('DELETE FROM upload_finalize_intents'))?.[0];
    expect(deleteQuery).toContain('"expiresAt" < now() RETURNING "uploadKey"');
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenCalledWith('pending/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg');
    expect(deleteObject).toHaveBeenCalledWith('pending/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png');
  });
});
