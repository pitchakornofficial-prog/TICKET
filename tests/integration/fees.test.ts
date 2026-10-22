import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { createEventDraft } from '../../src/server/events';
import {
  getEventFeeSettings,
  saveEventFeeSettings,
  lockOrganizerFee,
  listAllEventsWithFeeSettings,
} from '../../src/server/fees';

describe('Event fee settings and reserve integration (TASK-010, AC-23, AC-24, AC-25, AC-29)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('owner configures fee modes and reserve percentages independently per event with single effective mode per party', async () => {
    const ownerId = fixture.ids.owner;
    const orgId = fixture.ids.organizer;

    // 1. Create two separate events
    const event1 = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'งานเฟสติวัล A', location: 'อิมแพ็ค ชาเลนเจอร์' },
      [
        {
          startTime: '2026-11-15T18:00:00.000Z',
          endTime: '2026-11-15T22:00:00.000Z',
          ticketTypes: [{ name: 'บัตรทั่วไป', price: 2000, quota: 100 }],
        },
      ],
    );

    const event2 = await createEventDraft(
      fixture.pool,
      orgId,
      { title: 'งานคอนเสิร์ต B', location: 'ไบเทค บางนา' },
      [
        {
          startTime: '2026-12-05T18:00:00.000Z',
          endTime: '2026-12-05T22:00:00.000Z',
          ticketTypes: [{ name: 'บัตรนั่ง', price: 3000, quota: 100 }],
        },
      ],
    );

    // Initial settings should have defaults
    const defaultSettings1 = await getEventFeeSettings(fixture.pool, event1.id);
    expect(defaultSettings1.organizerFeeMode).toBe('percentage');
    expect(defaultSettings1.organizerFeeRate).toBe(0);
    expect(defaultSettings1.customerFeeMode).toBe('per_ticket');
    expect(defaultSettings1.customerFeeRate).toBe(0);
    expect(defaultSettings1.reservePercentage).toBe(0);
    expect(defaultSettings1.organizerFeeLocked).toBe(false);

    // 2. Owner configures Event 1 (AC-23: percentage, AC-24: per_ticket, AC-29: 10% reserve)
    const saved1 = await saveEventFeeSettings(
      fixture.pool,
      event1.id,
      {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5.5,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 20,
        reservePercentage: 10,
      },
      ownerId,
    );

    expect(saved1.eventId).toBe(event1.id);
    expect(saved1.organizerFeeMode).toBe('percentage');
    expect(saved1.organizerFeeRate).toBe(5.5);
    expect(saved1.customerFeeMode).toBe('per_ticket');
    expect(saved1.customerFeeRate).toBe(20);
    expect(saved1.reservePercentage).toBe(10);
    expect(saved1.organizerFeeLocked).toBe(false);

    // 3. Owner configures Event 2 with completely different modes and reserve (AC-23: flat_fee, AC-24: per_order, AC-29: 15% reserve)
    const saved2 = await saveEventFeeSettings(
      fixture.pool,
      event2.id,
      {
        organizerFeeMode: 'flat_fee',
        organizerFeeRate: 25000,
        customerFeeMode: 'per_order',
        customerFeeRate: 35,
        reservePercentage: 15,
      },
      ownerId,
    );

    expect(saved2.eventId).toBe(event2.id);
    expect(saved2.organizerFeeMode).toBe('flat_fee');
    expect(saved2.organizerFeeRate).toBe(25000);
    expect(saved2.customerFeeMode).toBe('per_order');
    expect(saved2.customerFeeRate).toBe(35);
    expect(saved2.reservePercentage).toBe(15);

    // 4. Verify independence: reloading Event 1 still returns its own settings intact (AC-29)
    const reloaded1 = await getEventFeeSettings(fixture.pool, event1.id);
    expect(reloaded1.organizerFeeMode).toBe('percentage');
    expect(reloaded1.organizerFeeRate).toBe(5.5);
    expect(reloaded1.customerFeeMode).toBe('per_ticket');
    expect(reloaded1.customerFeeRate).toBe(20);
    expect(reloaded1.reservePercentage).toBe(10);

    // 5. Verify single effective mode per party (AC-25): Exactly 1 organizer mode and 1 customer mode
    expect(['percentage', 'per_ticket', 'flat_fee']).toContain(reloaded1.organizerFeeMode);
    expect(['per_ticket', 'per_order', 'percentage']).toContain(reloaded1.customerFeeMode);

    // 6. Test listAllEventsWithFeeSettings
    const allEvents = await listAllEventsWithFeeSettings(fixture.pool);
    const ev1Item = allEvents.find(e => e.id === event1.id);
    const ev2Item = allEvents.find(e => e.id === event2.id);
    expect(ev1Item).toBeDefined();
    expect(ev1Item?.feeSettings.organizerFeeRate).toBe(5.5);
    expect(ev2Item).toBeDefined();
    expect(ev2Item?.feeSettings.organizerFeeRate).toBe(25000);

    // 7. Test organizerFeeLocked contract (G-49)
    await lockOrganizerFee(fixture.pool, event1.id);
    const lockedSettings = await getEventFeeSettings(fixture.pool, event1.id);
    expect(lockedSettings.organizerFeeLocked).toBe(true);

    // Attempting to change organizer fee mode when locked must throw
    await expect(
      saveEventFeeSettings(
        fixture.pool,
        event1.id,
        {
          organizerFeeMode: 'per_ticket', // changed mode!
          organizerFeeRate: 30,
          customerFeeMode: 'per_ticket',
          customerFeeRate: 20,
          reservePercentage: 10,
        },
        ownerId,
      ),
    ).rejects.toThrow('ค่าบริการฝั่งผู้จัดงานถูกล็อกแล้ว');

    // Attempting to change organizer fee rate when locked must throw
    await expect(
      saveEventFeeSettings(
        fixture.pool,
        event1.id,
        {
          organizerFeeMode: 'percentage', // same mode
          organizerFeeRate: 8, // changed rate!
          customerFeeMode: 'per_ticket',
          customerFeeRate: 20,
          reservePercentage: 10,
        },
        ownerId,
      ),
    ).rejects.toThrow('ค่าบริการฝั่งผู้จัดงานถูกล็อกแล้ว');

    // But updating customer fee rate or reserve percentage while organizer fee is locked is allowed
    const updatedCustomerSettings = await saveEventFeeSettings(
      fixture.pool,
      event1.id,
      {
        organizerFeeMode: 'percentage', // unchanged
        organizerFeeRate: 5.5, // unchanged
        customerFeeMode: 'percentage', // customer fee can be updated
        customerFeeRate: 3,
        reservePercentage: 12,
      },
      ownerId,
    );
    expect(updatedCustomerSettings.customerFeeMode).toBe('percentage');
    expect(updatedCustomerSettings.customerFeeRate).toBe(3);
    expect(updatedCustomerSettings.reservePercentage).toBe(12);
  });
});
