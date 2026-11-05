import { expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { setDatabasePool } from '../../src/server/database';
import { createEventDraft } from '../../src/server/events';
import { POST } from '../../src/app/api/public/checkout/request-otp/route';

it('sends the first checkout OTP when the reservation schema has not yet been created', async () => {
  const fixture = await authFixture('integration');
  setDatabasePool(fixture.pool);
  try {
    const event = await createEventDraft(fixture.pool, fixture.ids.organizer, {
      title: 'First checkout', location: 'Bangkok', limitPerOrder: 4,
    }, [{ startTime: '2027-01-01T12:00:00Z', endTime: '2027-01-01T14:00:00Z', ticketTypes: [{ name: 'General', price: 100, quota: 10 }] }]);
    const response = await POST(new Request('http://localhost/api/public/checkout/request-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer: { name: 'Test Buyer', email: 'buyer-first@ticket.invalid', phone: '0812345678' }, eventId: event.id, requestedQuantity: 1 }),
    }));
    expect(response.status).toBe(200);
  } finally {
    setDatabasePool(undefined);
    await fixture.cleanup();
  }
}, 30000);
