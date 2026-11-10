import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: 'owner', read: vi.fn(), write: vi.fn(), origin: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: async () => ({ user: { role: mocks.role } }) } }) }));
vi.mock('@/server/database', () => ({ getDatabasePool: () => ({}) }));
vi.mock('@/server/origin', () => ({ assertSameOrigin: mocks.origin }));
vi.mock('@/server/owner-contact-info', () => ({
  readOwnerContactInfo: mocks.read,
  writeOwnerContactInfo: mocks.write,
  parseContactInfo: (input: unknown) => input && typeof input === 'object' && 'email' in input ? input : null,
}));
import { GET, PUT } from '../../src/app/api/owner/contact-info/route';

describe('shared contact API access', () => {
  beforeEach(() => { mocks.role = 'owner'; mocks.read.mockReset(); mocks.write.mockReset(); mocks.origin.mockReset(); });
  it('lets organizers read without granting write access', async () => {
    mocks.role = 'organizer';
    mocks.read.mockResolvedValue({ email: 'owner@example.test' });
    const read = await GET(new Request('http://localhost/api/owner/contact-info'));
    expect(read.status).toBe(200);
    expect((await read.json()).contact.email).toBe('owner@example.test');
    const write = await PUT(new Request('http://localhost/api/owner/contact-info', { method: 'PUT', body: JSON.stringify({ email: 'new@example.test' }) }));
    expect(write.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('checks origin before an owner can write', async () => {
    mocks.origin.mockReturnValue(new Response(null, { status: 403 }));
    const response = await PUT(new Request('http://localhost/api/owner/contact-info', { method: 'PUT', body: '{}' }));
    expect(response.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('persists owner updates', async () => {
    const response = await PUT(new Request('http://localhost/api/owner/contact-info', { method: 'PUT', body: JSON.stringify({ email: 'owner@example.test' }) }));
    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledOnce();
  });
  it('rejects oversized request bodies before writing', async () => {
    const response = await PUT(new Request('http://localhost/api/owner/contact-info', {
      method: 'PUT', body: JSON.stringify({ email: 'x'.repeat(33 * 1024) }),
    }));
    expect(response.status).toBe(413);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
