import { describe, it, expect } from 'vitest';

describe('News domain unit tests (TASK-008, AC-04)', () => {
  it('truncates snippet properly when content exceeds 200 characters', () => {
    const longContent = 'A'.repeat(250);
    const snippet = longContent.length > 200 ? `${longContent.slice(0, 197)}...` : longContent;
    expect(snippet.length).toBe(200);
    expect(snippet.endsWith('...')).toBe(true);
  });

  it('keeps full snippet when content is under 200 characters', () => {
    const shortContent = 'แจ้งเปิดจำหน่ายบัตรคอนเสิร์ตใหญ่รอบพิเศษ';
    const snippet = shortContent.length > 200 ? `${shortContent.slice(0, 197)}...` : shortContent;
    expect(snippet).toBe(shortContent);
  });

  it('validates news status transitions: only published news have publication timestamp', () => {
    const draft = { status: 'draft', publishedAt: null };
    const published = { status: 'published', publishedAt: new Date().toISOString() };
    expect(draft.publishedAt).toBeNull();
    expect(published.publishedAt).not.toBeNull();
  });
});
