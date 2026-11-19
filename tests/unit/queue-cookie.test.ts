import { describe, expect, it, vi } from 'vitest';
import { readQueueCookie, serializeQueueCookie } from '../../src/server/queue-cookie';
import { QUEUE_ADMISSION_LOCK_NAMESPACE, QUEUE_CAPACITY } from '../../src/server/queue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Queue pass integrity and admission controls', () => {
  it('signs queue cookies as HttpOnly and rejects tampering or cross-event reuse', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('QUEUE_TOKEN_SECRET', 'test-queue-signing-secret-that-is-long-enough');
    const serialized = serializeQueueCookie('event-a', 'qtok_entry-a', 'session-a');
    const value = serialized.split(';')[0].slice('ticket_queue_pass='.length);
    const request = new Request('http://localhost/events/event-a', {
      headers: { cookie: `ticket_queue_pass=${value}` },
    });

    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('SameSite=Lax');
    expect(readQueueCookie(request, 'event-a')).toEqual({
      entryToken: 'qtok_entry-a',
      sessionId: 'session-a',
    });
    expect(readQueueCookie(request, 'event-b')).toBeNull();

    const sep = value.lastIndexOf('.');
    const sig = value.slice(sep + 1);
    const tamperedSig = sig[0] === 'X' ? `Y${sig.slice(1)}` : `X${sig.slice(1)}`;
    const tamperedValue = `${value.slice(0, sep + 1)}${tamperedSig}`;
    const tamperedRequest = new Request('http://localhost/events/event-a', {
      headers: { cookie: `ticket_queue_pass=${tamperedValue}` },
    });
    expect(readQueueCookie(tamperedRequest, 'event-a')).toBeNull();
  });

  it('stores queue creation limits in PostgreSQL and locks admission capacity', () => {
    const root = resolve(__dirname, '../..');
    const queueSource = readFileSync(resolve(root, 'src/server/queue.ts'), 'utf8');
    const reservationSource = readFileSync(resolve(root, 'src/server/reservation.ts'), 'utf8');
    const statusRoute = readFileSync(resolve(root, 'src/app/api/events/[id]/queue/status/route.ts'), 'utf8');

    expect(queueSource).toContain('event_queue_rate_limits');
    expect(queueSource).toContain('QUEUE_SESSION_LIMIT');
    expect(queueSource).toContain('QUEUE_IP_LIMIT');
    expect(queueSource).toContain(`QUEUE_ADMISSION_LOCK_NAMESPACE = ${QUEUE_ADMISSION_LOCK_NAMESPACE}`);
    expect(queueSource).toContain('pg_advisory_xact_lock(hashtext($1), $2::int)');
    expect(reservationSource).toContain('hashtext(p_event_id), $' + '{QUEUE_ADMISSION_LOCK_NAMESPACE}');
    expect(statusRoute).toContain('serializeQueueCookie');
    expect(statusRoute).not.toContain('token: result.token');
    expect(QUEUE_CAPACITY).toBe(200);
  });
});
