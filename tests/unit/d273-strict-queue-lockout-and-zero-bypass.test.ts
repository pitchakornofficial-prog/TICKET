import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { POST as directSessionPost } from '../../src/app/api/public/checkout/direct-session/route';
import { POST as reservePost } from '../../src/app/api/public/checkout/reserve/route';
import { setDatabasePool } from '../../src/server/database';
import { getOrCreateQueueEntry, QUEUE_CAPACITY, verifyQueueAccess } from '../../src/server/queue';

describe('D-273: Strict Queue Lockout & Zero-Bypass Guard', () => {
  const rootDir = resolve(__dirname, '../..');

  it('records D-273 in docs/requirement.md with agreed details and zero emojis', () => {
    const requirementContent = readFileSync(
      resolve(rootDir, 'docs/requirement.md'),
      'utf-8',
    );
    expect(requirementContent).toContain('D-273');
    expect(requirementContent).toContain('Strict Queue Lockout & Zero-Bypass Guard');
    expect(requirementContent).toContain('ปิดการข้ามคิวโดยสมบูรณ์เมื่อคิวเต็ม 200');
    expect(requirementContent).toContain('กรุณารอตามลำดับคิว');

    const d273Line = requirementContent
      .split('\n')
      .find(line => line.includes('D-273')) || '';
    expect(d273Line).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('enforces lockout in QueueWaitingRoom while waiting in queue', () => {
    const queueComponent = readFileSync(
      resolve(rootDir, 'src/components/queue-waiting-room.tsx'),
      'utf-8',
    );

    // Button is disabled when not ready and peopleAhead > 0
    expect(queueComponent).toContain('isReady || peopleAhead <= 0 ?');
    expect(queueComponent).toContain('กรุณารอตามลำดับคิว (ระบบจะพาเข้าสู่หน้าซื้อบัตรอัตโนมัติเมื่อถึงคิว)');
    expect(queueComponent).toContain('disabled');

    // handleProceedNow prevents skipping when waiting
    expect(queueComponent).toContain('if (!isReady && peopleAhead > 0)');

    // Zero Emojis (D-14)
    expect(queueComponent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('enforces queue access verification on server and checkout flow gating', () => {
    expect(typeof verifyQueueAccess).toBe('function');
    expect(QUEUE_CAPACITY).toBe(200);

    const checkoutFlow = readFileSync(
      resolve(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf-8',
    );
    expect(checkoutFlow).toContain('D-273: Enforce queue gating at checkout');
    expect(checkoutFlow).toContain('/api/events/' + '$' + '{eventId}/queue/status');
    expect(checkoutFlow).toContain('router.replace(`' + '/events/' + '$' + '{eventId}/queue`)');

    // Zero Emojis (D-14)
    expect(checkoutFlow).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  describe('server-side production queue enforcement and fail-closed checks', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      setDatabasePool(undefined);
    });

    it('fails closed in production when queue queries error', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const failingPool = {
        query: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      } as unknown as Pool;

      await expect(getOrCreateQueueEntry(failingPool, 'evt-fail')).rejects.toThrow('DB connection lost');
      await expect(verifyQueueAccess(failingPool, 'evt-fail', 'qtok_any')).resolves.toBe(false);
    });

    it('blocks direct-session and reserve with 429 QUEUE_LOCKED when 200 slots are full without valid queue token', async () => {
      const fullQueuePool = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('CREATE TABLE IF NOT EXISTS')) return { rows: [], rowCount: 0 };
          if (sql.includes('UPDATE event_queue_entries')) return { rows: [], rowCount: 0 };
          if (sql.includes('COUNT(*)::int AS count')) return { rows: [{ count: 200 }], rowCount: 1 };
          if (sql.includes('SELECT status, "expiresAt"')) return { rows: [], rowCount: 0 };
          return { rows: [], rowCount: 0 };
        }),
      } as unknown as Pool;
      setDatabasePool(fullQueuePool);

      const directRes = await directSessionPost(
        new Request('http://localhost/api/public/checkout/direct-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'สมชาย ใจดี',
            email: 'somchai@example.com',
            phone: '0812345678',
            eventId: 'evt-full',
            totalTickets: 1,
          }),
        }),
      );
      expect(directRes.status).toBe(429);
      const directData = await directRes.json();
      expect(directData.code).toBe('QUEUE_LOCKED');

      const reserveRes = await reservePost(
        new Request('http://localhost/api/public/checkout/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verifiedToken: 'gver_dummy',
            eventId: 'evt-full',
            sessionId: 'sess-1',
            items: [{ ticketTypeId: 'tt-1', quantity: 1 }],
            queueToken: 'qtok_invalid',
          }),
        }),
      );
      expect(reserveRes.status).toBe(429);
      const reserveData = await reserveRes.json();
      expect(reserveData.code).toBe('QUEUE_LOCKED');
    });
  });
});
