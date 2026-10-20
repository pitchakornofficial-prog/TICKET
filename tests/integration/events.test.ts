import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture, fixturePassword } from '../support/auth-fixture';
import { createEventDraft, getEventDetails, updateEventDraft, submitSessionForApproval } from '../../src/server/events';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';

describe('Organizer event draft isolation and roundtrip (TASK-005, AC-07)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';
  let secondOrganizerId: string;

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);

    // Create a second organizer to test isolation between organizers
    secondOrganizerId = randomUUID();
    const password = await hashPassword(fixturePassword);
    await fixture.pool.query(
      'INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, true, $4, now(), now())',
      [secondOrganizerId, 'ผู้จัดงานคนที่สอง', 'second-organizer@ticket.invalid', 'organizer'],
    );
    await fixture.pool.query(
      'INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $2, $4, now(), now())',
      [randomUUID(), secondOrganizerId, 'credential', password],
    );
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('organizer creates multi-session and multi-ticket-type event draft', async () => {
    const orgId = fixture.ids.organizer;
    const event = await createEventDraft(
      fixture.pool,
      orgId,
      {
        title: 'คอนเสิร์ตร็อคเปิดฟ้า 2026',
        description: 'คอนเสิร์ตร็อคยิ่งใหญ่แห่งปี',
        location: 'อิมแพ็ค อารีน่า เมืองทองธานี',
        limitPerOrder: 6,
        posterUrl: '/api/media/posters/rock.png',
      },
      [
        {
          startTime: '2026-12-01T19:00:00.000Z',
          endTime: '2026-12-01T22:00:00.000Z',
          admissionStartTime: '2026-12-01T17:00:00.000Z',
          admissionEndTime: '2026-12-01T20:00:00.000Z',
          ticketTypes: [
            { name: 'บัตรยืน VIP', price: 3500, quota: 500, description: 'เข้าก่อนและใกล้เวที' },
            { name: 'บัตรยืน Regular', price: 2000, quota: 1500, description: 'บัตรยืนทั่วไป' },
          ],
        },
        {
          startTime: '2026-12-02T19:00:00.000Z',
          endTime: '2026-12-02T22:00:00.000Z',
          ticketTypes: [
            { name: 'บัตรยืน All Area', price: 2500, quota: 2000 },
          ],
        },
      ],
    );

    expect(event).toBeDefined();
    if (!event) throw new Error('Event draft creation failed');
    expect(event.title).toBe('คอนเสิร์ตร็อคเปิดฟ้า 2026');
    expect(event.sessions).toHaveLength(2);
    expect(event.sessions[0].ticketTypes).toHaveLength(2);
    expect(event.sessions[1].ticketTypes).toHaveLength(1);
    expect(event.status).toBe('draft');
    expect(event.sessions[0].status).toBe('draft');

    // Submit session 1 for approval
    const submitResult = await submitSessionForApproval(fixture.pool, event.sessions[0].id, orgId);
    expect(submitResult.success).toBe(true);

    const reloaded = await getEventDetails(fixture.pool, event.id, orgId);
    expect(reloaded?.sessions[0].status).toBe('pending_approval');
    expect(reloaded?.sessions[1].status).toBe('draft'); // sibling session remains draft (AC-06 prerequisite)
  });

  it('enforces isolation: another organizer cannot read, edit or submit sessions of this event (AC-07)', async () => {
    const org1 = fixture.ids.organizer;
    const org2 = secondOrganizerId;

    const event = await createEventDraft(
      fixture.pool,
      org1,
      {
        title: 'คอนเสิร์ตส่วนตัวของ Organizer 1',
        location: 'ธันเดอร์โดม',
        limitPerOrder: 4,
      },
      [
        {
          startTime: '2026-11-15T19:00:00.000Z',
          endTime: '2026-11-15T21:00:00.000Z',
          ticketTypes: [{ name: 'Standard', price: 1000, quota: 50 }],
        },
      ],
    );

    if (!event) throw new Error('Event draft creation failed');

    // 1. Direct read by another organizer fails
    await expect(getEventDetails(fixture.pool, event.id, org2)).rejects.toThrow('ไม่อนุญาต');

    // 2. Direct update by another organizer fails
    await expect(
      updateEventDraft(fixture.pool, event.id, org2, { title: 'พยายามแอบแก้ชื่องาน' }),
    ).rejects.toThrow('ไม่อนุญาต: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้');

    // 3. Submit session by another organizer fails
    await expect(
      submitSessionForApproval(fixture.pool, event.sessions[0].id, org2),
    ).rejects.toThrow('ไม่อนุญาต: คุณไม่ใช่ผู้จัดงานคอนเสิร์ตนี้');
  });
});
