import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture, fixtureAccounts } from '../support/auth-fixture.ts';
import {
  createEventDraft,
  submitSessionForApproval,
  approveSession,
  listPublicEvents,
  getPublicEventWithApprovedSessions,
} from '../../src/server/events.ts';
import type { Pool } from 'pg';

describe('Public concert catalog and search (TASK-007, AC-01, AC-03)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  let pool: Pool;
  let ownerId: string;
  let organizerId: string;

  beforeAll(async () => {
    fixture = await authFixture('integration');
    pool = fixture.auth.options.database as Pool;

    // Get owner and organizer ids
    const ownerRes = await pool.query('SELECT id FROM auth_user WHERE email = $1', [fixtureAccounts.owner.email]);
    ownerId = ownerRes.rows[0].id;

    const orgRes = await pool.query('SELECT id FROM auth_user WHERE email = $1', [fixtureAccounts.organizer.email]);
    organizerId = orgRes.rows[0].id;
  });

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('hides draft and pending events from public catalog and search', async () => {
    const draftEvent = await createEventDraft(
      pool,
      organizerId,
      {
        title: 'Draft Secret Live Concert',
        location: 'Private Secret Hall',
        description: 'Should never appear in public catalog',
      },
      [
        {
          startTime: '2026-12-01T19:00:00+07:00',
          endTime: '2026-12-01T22:00:00+07:00',
          ticketTypes: [{ name: 'Standing A', price: 2000, quota: 100 }],
        },
      ],
    );

    if (!draftEvent) throw new Error('Failed to create draft event');

    // Initial draft: not in catalog
    const initialList = await listPublicEvents(pool);
    expect(initialList.some(e => e.id === draftEvent.id)).toBe(false);

    // Search by title returns empty
    const searchDraft = await listPublicEvents(pool, 'Secret Live');
    expect(searchDraft.some(e => e.id === draftEvent.id)).toBe(false);

    // Direct detail query returns null
    const directDetail = await getPublicEventWithApprovedSessions(pool, draftEvent.id);
    expect(directDetail).toBeNull();
  });

  it('shows approved events with approved sessions in catalog and supports search (AC-01, AC-03)', async () => {
    const concertTitle = `Public Rock Festival ${randomUUID().slice(0, 6)}`;
    const event = await createEventDraft(
      pool,
      organizerId,
      {
        title: concertTitle,
        location: 'Thunder Dome Muang Thong Thani',
        description: 'เทศกาลดนตรีร็อกสุดยิ่งใหญ่แห่งปี',
        limitPerOrder: 4,
      },
      [
        {
          startTime: '2026-11-20T18:00:00+07:00',
          endTime: '2026-11-20T22:00:00+07:00',
          admissionStartTime: '2026-11-20T16:00:00+07:00',
          ticketTypes: [
            { name: 'บัตรยืน Zone A', price: 2500, quota: 500, description: 'ติดขอบเวที' },
            { name: 'บัตรยืน Zone B', price: 1500, quota: 800, description: 'โซนทั่วไป' },
          ],
        },
        {
          // Sibling session that will remain draft
          startTime: '2026-11-21T18:00:00+07:00',
          endTime: '2026-11-21T22:00:00+07:00',
          ticketTypes: [
            { name: 'บัตรยืน Zone A', price: 2500, quota: 500 },
          ],
        },
      ],
    );

    if (!event) throw new Error('Failed to create event');

    const firstSession = event.sessions[0];
    const secondSession = event.sessions[1];

    // Submit first session for approval and approve it
    await submitSessionForApproval(pool, firstSession.id, organizerId);
    await approveSession(pool, firstSession.id, ownerId);

    // Sibling session 2 is still draft, so it must not be approved
    expect(secondSession.status).toBe('draft');

    // 1. Catalog listing includes approved concert
    const publicList = await listPublicEvents(pool);
    const foundInList = publicList.find(e => e.id === event.id);
    expect(foundInList).toBeDefined();
    expect(foundInList?.title).toBe(concertTitle);
    expect(foundInList?.startingPrice).toBe(1500);
    expect(foundInList?.approvedSessionCount).toBe(1);

    // 2. Search by title (AC-03)
    const searchResult = await listPublicEvents(pool, concertTitle);
    expect(searchResult.length).toBeGreaterThanOrEqual(1);
    expect(searchResult.some(e => e.id === event.id)).toBe(true);

    // 3. Search empty result (AC-03)
    const emptyResult = await listPublicEvents(pool, 'NonExistentConcertNameXYZ999');
    expect(emptyResult.length).toBe(0);

    // 4. Detail view only includes approved sessions (AC-01, AC-02)
    const detail = await getPublicEventWithApprovedSessions(pool, event.id);
    expect(detail).not.toBeNull();
    expect(detail?.title).toBe(concertTitle);
    expect(detail?.sessions.length).toBe(1);
    expect(detail?.sessions[0].id).toBe(firstSession.id);
    expect(detail?.sessions[0].ticketTypes.length).toBe(2);
    expect(detail?.sessions[0].ticketTypes[0].price).toBe(1500); // Sorted ASC
    expect(detail?.sessions[0].ticketTypes[1].price).toBe(2500);
  });
});
