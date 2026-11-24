import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { getDirectIssuanceEventsOverview } from '../../src/server/direct-tickets';
import { randomUUID } from 'node:crypto';

describe('Direct tickets issuance & event overview integration (D-280, D-281)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';
  let eventId: string;
  let sessionId: string;
  let ttId: string;

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
    const orgId = fixture.ids.organizer;

    eventId = `ev-direct-test-${randomUUID().slice(0, 8)}`;
    sessionId = `sess-direct-test-${randomUUID().slice(0, 8)}`;
    ttId = `tt-direct-test-${randomUUID().slice(0, 8)}`;

    // Create an approved event and approved session with ticket types
    await fixture.pool.query(
      `INSERT INTO events (id, "organizerId", title, description, location, status, "createdAt", "updatedAt")
       VALUES ($1, $2, 'UBU Direct Test Fest 2026', 'ทดสอบระบบออกบัตรตรง', 'หอประชุมใหญ่', 'approved', now(), now())`,
      [eventId, orgId],
    );

    await fixture.pool.query(
      `INSERT INTO event_sessions (id, "eventId", "startTime", "endTime", status, "createdAt", "updatedAt")
       VALUES ($1, $2, now() + interval '5 days', now() + interval '5 days 4 hours', 'approved', now(), now())`,
      [sessionId, eventId],
    );

    await fixture.pool.query(
      `INSERT INTO ticket_types (id, "sessionId", name, price, quota, "createdAt", "updatedAt")
       VALUES ($1, $2, 'Regular Direct Test Pass', 250.00, 100, now(), now())`,
      [ttId, sessionId],
    );
  }, 30000);

  afterAll(async () => {
    if (fixture) {
      // Clean up test event
      await fixture.pool.query('DELETE FROM events WHERE id = $1', [eventId]).catch(() => {});
      await fixture.cleanup();
    }
  });

  it('getDirectIssuanceEventsOverview returns approved event with ticket types and dual quota aliases', async () => {
    const overview = await getDirectIssuanceEventsOverview(fixture.pool);
    expect(overview.length).toBeGreaterThan(0);

    const testEv = overview.find(e => e.eventId === eventId);
    expect(testEv).toBeDefined();
    expect(testEv?.eventTitle).toBe('UBU Direct Test Fest 2026');
    expect(testEv?.sessions.length).toBeGreaterThan(0);

    const testSess = testEv?.sessions.find(s => s.sessionId === sessionId);
    expect(testSess).toBeDefined();
    expect(testSess?.ticketTypes.length).toBeGreaterThan(0);

    const tt = testSess?.ticketTypes.find(t => t.ticketTypeId === ttId);
    expect(tt).toBeDefined();
    expect(tt?.name).toBe('Regular Direct Test Pass');
    expect(tt?.price).toBe(250);

    // Verify both property naming conventions exist
    expect(tt?.quota).toBe(100);
    expect(tt?.totalQuota).toBe(100);
    expect(tt?.available).toBe(100);
    expect(tt?.remainingQuota).toBe(100);
  });
});
