import { beforeEach, expect, it, vi } from 'vitest';
import { safeRevalidateTag } from '@/server/cache';
import { POST } from '@/app/api/owner/news/route';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  createNews: vi.fn(),
  session: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({
  api: { getSession: mocks.session }, options: { database: {} },
}) }));
vi.mock('@/server/news', () => ({ createNews: mocks.createNews, listOwnerNews: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'owner', role: 'owner' } });
});
const request = () => new Request('http://localhost:3000/api/owner/news', {
  method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'New article', content: 'Article body', status: 'published' }),
});

it('expires a tag immediately and remains callable outside a Next request', () => {
  safeRevalidateTag('public-events');
  expect(mocks.revalidateTag).toHaveBeenCalledWith('public-events', { expire: 0 });
  mocks.revalidateTag.mockImplementation(() => { throw new Error('No request context'); });
  expect(() => safeRevalidateTag('public-events')).not.toThrow();
});

it('invalidates published news only after the write succeeds', async () => {
  mocks.createNews.mockImplementation(async () => {
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    return { id: 'article', status: 'published' };
  });
  expect((await POST(request())).status).toBe(201);
  expect(mocks.revalidateTag).toHaveBeenCalledWith('public-news', { expire: 0 });
});

it('does not evict public news for drafts, rejected writes or unauthorized callers', async () => {
  mocks.createNews.mockResolvedValue({ id: 'draft', status: 'draft' });
  expect((await POST(request())).status).toBe(201);
  mocks.createNews.mockRejectedValue(new Error('Write failed'));
  expect((await POST(request())).status).toBe(500);
  mocks.session.mockResolvedValue({ user: { id: 'other', role: 'organizer' } });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.createNews).toHaveBeenCalledTimes(2);
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
});
