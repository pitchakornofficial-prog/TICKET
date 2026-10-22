import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import {
  createNews,
  publishNews,
  listPublishedNews,
  getPublishedNewsById,
  listOwnerNews,
  deleteNews,
} from '../../src/server/news';

describe('News management and public access integration (TASK-008, AC-04)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('owner can create news as draft and as published', async () => {
    const ownerId = fixture.ids.owner;

    // 1. Create a draft news
    const draft = await createNews(fixture.pool, {
      title: 'ประกาศร่างข่าวสาร 1',
      content: 'เนื้อหาร่างที่ยังไม่เปิดเผยต่อสาธารณะ',
      status: 'draft',
      authorId: ownerId,
    });

    expect(draft.id).toBeDefined();
    expect(draft.status).toBe('draft');
    expect(draft.publishedAt).toBeNull();

    // 2. Create a published news
    const published = await createNews(fixture.pool, {
      title: 'ข่าวประชาสัมพันธ์งานคอนเสิร์ตใหญ่',
      content: 'เปิดจำหน่ายบัตรอย่างเป็นทางการแล้ววันนี้',
      status: 'published',
      authorId: ownerId,
    });

    expect(published.id).toBeDefined();
    expect(published.status).toBe('published');
    expect(published.publishedAt).not.toBeNull();

    // 3. listPublishedNews only returns published, not draft
    const publicList = await listPublishedNews(fixture.pool);
    const publishedFound = publicList.find(n => n.id === published.id);
    const draftFound = publicList.find(n => n.id === draft.id);

    expect(publishedFound).toBeDefined();
    expect(publishedFound?.title).toBe('ข่าวประชาสัมพันธ์งานคอนเสิร์ตใหญ่');
    expect(draftFound).toBeUndefined();

    // 4. getPublishedNewsById returns detail for published, but null for draft
    const pubDetail = await getPublishedNewsById(fixture.pool, published.id);
    expect(pubDetail).not.toBeNull();
    expect(pubDetail?.title).toBe('ข่าวประชาสัมพันธ์งานคอนเสิร์ตใหญ่');

    const draftDetail = await getPublishedNewsById(fixture.pool, draft.id);
    expect(draftDetail).toBeNull();

    // 5. Publishing the draft makes it accessible to public
    const publishedDraft = await publishNews(fixture.pool, draft.id);
    expect(publishedDraft?.status).toBe('published');

    const draftNowPublic = await getPublishedNewsById(fixture.pool, draft.id);
    expect(draftNowPublic).not.toBeNull();
    expect(draftNowPublic?.title).toBe('ประกาศร่างข่าวสาร 1');

    // 6. Owner can list all news
    const ownerList = await listOwnerNews(fixture.pool);
    expect(ownerList.length).toBeGreaterThanOrEqual(2);

    // 7. Delete news
    const deleted = await deleteNews(fixture.pool, draft.id);
    expect(deleted).toBe(true);

    const afterDelete = await getPublishedNewsById(fixture.pool, draft.id);
    expect(afterDelete).toBeNull();
  });
});
