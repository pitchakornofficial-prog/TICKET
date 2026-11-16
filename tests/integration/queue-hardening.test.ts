import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { setDatabasePool } from '../../src/server/database';
import { createEventDraft } from '../../src/server/events';
import { getOrCreateQueueEntry, QueueRateLimitedError, QUEUE_CAPACITY } from '../../src/server/queue';
import { GET as queueStatusGet } from '../../src/app/api/events/[id]/queue/status/route';

describe('Queue database rate limits and capacity serialization', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;

  beforeAll(async () => {
    fixture = await authFixture('integration', 'http://127.0.0.1:3100');
    setDatabasePool(fixture.pool);
  }, 30000);

  afterAll(async () => {
    setDatabasePool(undefined);
    if (fixture) await fixture.cleanup();
  });

  it('creates at most 200 active passes while queuing concurrent requests', async () => {
    const event = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      { title: 'Queue Capacity Serialization', location: 'Test venue' },
      [{
        startTime: '2026-12-30T19:00:00.000Z',
        endTime: '2026-12-30T22:00:00.000Z',
        ticketTypes: [{ name: 'General', price: 1000, quota: 500 }],
      }],
    );

    const outcomes = await Promise.all(Array.from({ length: 205 }, (_, index) =>
      getOrCreateQueueEntry(fixture.pool, event.id, null, {
        sessionId: `queue-session-${index}`,
        clientIp: `198.51.100.${index + 1}`,
      }),
    ));
    const counts = await fixture.pool.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count FROM event_queue_entries
       WHERE "eventId" = $1 GROUP BY status`,
      [event.id],
    );
    const byStatus = new Map(counts.rows.map(row => [row.status, Number(row.count)]));

    expect(outcomes.filter(result => result.allowed)).toHaveLength(QUEUE_CAPACITY);
    expect(byStatus.get('active')).toBe(QUEUE_CAPACITY);
    expect(byStatus.get('waiting')).toBe(5);
  }, 30000);

  it('reuses a pass and blocks repeated pass creation for one signed session', async () => {
    const event = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      { title: 'Queue Pass Reuse', location: 'Test venue' },
      [{
        startTime: '2026-12-31T19:00:00.000Z',
        endTime: '2026-12-31T22:00:00.000Z',
        ticketTypes: [{ name: 'General', price: 1000, quota: 50 }],
      }],
    );

    const first = await getOrCreateQueueEntry(fixture.pool, event.id, null, {
      sessionId: 'signed-session-reuse',
      clientIp: '198.51.100.250',
    });
    const reused = await getOrCreateQueueEntry(fixture.pool, event.id, first.token, {
      sessionId: 'signed-session-reuse',
      clientIp: '198.51.100.250',
    });
    expect(reused.token).toBe(first.token);

    for (let index = 0; index < 3; index += 1) {
      await getOrCreateQueueEntry(fixture.pool, event.id, null, {
        sessionId: 'signed-session-reuse',
        clientIp: `198.51.100.${index + 10}`,
      });
    }
    await expect(
      getOrCreateQueueEntry(fixture.pool, event.id, null, {
        sessionId: 'signed-session-reuse',
        clientIp: '198.51.100.251',
      }),
    ).rejects.toBeInstanceOf(QueueRateLimitedError);
  }, 30000);

  it('keeps the pass in an HttpOnly cookie and reuses it without exposing the token in JSON', async () => {
    const event = await createEventDraft(
      fixture.pool,
      fixture.ids.organizer,
      { title: 'HttpOnly Queue Pass', location: 'Test venue' },
      [{
        startTime: '2026-12-31T19:00:00.000Z',
        endTime: '2026-12-31T22:00:00.000Z',
        ticketTypes: [{ name: 'General', price: 1000, quota: 50 }],
      }],
    );
    const params = Promise.resolve({ id: event.id });
    const firstResponse = await queueStatusGet(
      new Request(`http://localhost/api/events/${event.id}/queue/status`),
      { params },
    );
    const firstCookie = firstResponse.headers.get('set-cookie');
    if (!firstCookie) throw new Error('Expected queue status to set an HttpOnly pass cookie');
    const firstBody = await firstResponse.json();
    expect(firstResponse.status).toBe(200);
    expect(firstCookie).toContain('HttpOnly');
    expect(firstBody).not.toHaveProperty('token');

    const cookiePair = firstCookie.split(';')[0];
    const secondResponse = await queueStatusGet(
      new Request(`http://localhost/api/events/${event.id}/queue/status`, {
        headers: { cookie: cookiePair },
      }),
      { params: Promise.resolve({ id: event.id }) },
    );
    const secondBody = await secondResponse.json();
    expect(secondResponse.status).toBe(200);
    expect(secondBody.queueNumber).toBe(firstBody.queueNumber);
    expect(secondBody).not.toHaveProperty('token');

    const entries = await fixture.pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM event_queue_entries WHERE "eventId" = $1`,
      [event.id],
    );
    expect(Number(entries.rows[0]?.count)).toBe(1);
  });
});
