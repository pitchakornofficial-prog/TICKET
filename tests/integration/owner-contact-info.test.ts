import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import { CONTACT_FIELDS, parseContactInfo, readOwnerContactInfo, writeOwnerContactInfo } from '../../src/server/owner-contact-info';

describe('shared owner contact information', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  beforeAll(async () => { fixture = await authFixture('integration'); }, 30000);
  afterAll(async () => { if (fixture) await fixture.cleanup(); });

  it('stores and reads actual settings, and rejects invalid input', async () => {
    expect(await readOwnerContactInfo(fixture.pool)).toBeNull();
    expect(parseContactInfo({ hotline: 'x' })).toBeNull();
    const contact = parseContactInfo(Object.fromEntries(CONTACT_FIELDS.map(key => [key, key === 'email' ? 'owner@example.test' : ''])));
    expect(contact).not.toBeNull();
    if (!contact) throw new Error('missing contact');
    await writeOwnerContactInfo(fixture.pool, contact);
    expect(await readOwnerContactInfo(fixture.pool)).toEqual(contact);
    await writeOwnerContactInfo(fixture.pool, { ...contact, hotline: '02-000-0000' });
    expect((await readOwnerContactInfo(fixture.pool))?.hotline).toBe('02-000-0000');
  });
});
