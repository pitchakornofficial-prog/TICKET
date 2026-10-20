import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture, fixturePassword } from '../support/auth-fixture';
import {
  createEventDraft,
  submitSessionForApproval,
  approveSession,
  getPublicEventWithApprovedSessions,
} from '../../src/server/events';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';

describe('Session approval authorization and isolation (TASK-006, AC-02, AC-05, AC-66)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';
  let secondOrganizerId: string;

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);

    secondOrganizerId = randomUUID();
    const password = await hashPassword(fixturePassword);
    await fixture.pool.query(
      'INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, true, $4, now(), now())',
      [secondOrganizerId, 'ผู้จัดงานคนที่สอง', 'second-org@ticket.invalid', 'organizer'],
    );
    await fixture.pool.query(
      'INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $2, $4, now(), now())',
      [randomUUID(), secondOrganizerId, 'credential', password],
    );
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('organizer cannot approve sessions; only owner can approve (AC-05)', async () => {
    const orgId = fixture.ids.organizer;
    const ownerId = fixture.ids.owner;

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตรอบอนุมัติ', location: 'อิมแพ็ค' },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'Zone A', price: 2000, quota: 100 }],
        },
      ],
    );
    if (!event) throw new Error('Event draft failed');

    const sessionId = event.sessions[0].id;
    await submitSessionForApproval(fixture.pool, sessionId, orgId);

    // 1. Organizer attempts to approve their own session: rejected
    await expect(approveSession(fixture.pool, sessionId, orgId)).rejects.toThrow('ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น');

    // 2. Another organizer attempts to approve: rejected
    await expect(approveSession(fixture.pool, sessionId, secondOrganizerId)).rejects.toThrow('ไม่อนุญาต: เฉพาะเจ้าของเว็บเท่านั้น');

    // 3. Owner approves: succeeds
    const approved = await approveSession(fixture.pool, sessionId, ownerId);
    expect(approved.success).toBe(true);
    expect(approved.sessionId).toBe(sessionId);
  });

  it('approves sessions independently; unapproved sibling remains hidden from public catalog (AC-02, AC-66)', async () => {
    const orgId = fixture.ids.organizer;
    const ownerId = fixture.ids.owner;

    const event = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'คอนเสิร์ตสองรอบ', location: 'พารากอน ฮอลล์' },
      [
        {
          startTime: '2026-12-10T19:00:00.000Z',
          endTime: '2026-12-10T22:00:00.000Z',
          ticketTypes: [{ name: 'Day 1 Seat', price: 1500, quota: 200 }],
        },
        {
          startTime: '2026-12-11T19:00:00.000Z',
          endTime: '2026-12-11T22:00:00.000Z',
          ticketTypes: [{ name: 'Day 2 Seat', price: 1500, quota: 200 }],
        },
      ],
    );
    if (!event) throw new Error('Event draft failed');

    const session1Id = event.sessions[0].id;
    const session2Id = event.sessions[1].id;

    // Both sessions start draft; public catalog query returns null
    const beforeApproval = await getPublicEventWithApprovedSessions(fixture.pool, event.id);
    expect(beforeApproval).toBeNull();

    // Submit and approve ONLY session 1
    await submitSessionForApproval(fixture.pool, session1Id, orgId);
    await approveSession(fixture.pool, session1Id, ownerId);

    // Public catalog returns event with ONLY session 1 approved
    const afterApproval = await getPublicEventWithApprovedSessions(fixture.pool, event.id);
    expect(afterApproval).not.toBeNull();
    expect(afterApproval?.title).toBe('คอนเสิร์ตสองรอบ');
    expect(afterApproval?.sessions).toHaveLength(1);
    expect(afterApproval?.sessions[0].id).toBe(session1Id);
    expect(afterApproval?.sessions[0].ticketTypes[0].name).toBe('Day 1 Seat');

    // Session 2 is NOT in public catalog (remains draft/unapproved)
    const sessionIds = afterApproval?.sessions.map((s: { id: string }) => s.id);
    expect(sessionIds).not.toContain(session2Id);
  });
});
