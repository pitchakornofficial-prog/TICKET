import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockPool = { query: vi.fn() };

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: { getSession: mockGetSession },
    options: { database: mockPool, secret: 'test-secret' },
  }),
}));

vi.mock('@/server/database', () => ({
  getDatabasePool: () => mockPool,
}));

vi.mock('@/server/origin', () => ({
  assertSameOrigin: () => null,
}));

const mockCreateNotification = vi.fn();
vi.mock('@/server/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

const mockReadOwnerContactInfo = vi.fn();
const mockWriteOwnerContactInfo = vi.fn();
vi.mock('@/server/owner-contact-info', () => ({
  readOwnerContactInfo: (...args: unknown[]) => mockReadOwnerContactInfo(...args),
  writeOwnerContactInfo: (...args: unknown[]) => mockWriteOwnerContactInfo(...args),
  parseContactInfo: (input: unknown) => input,
}));

import { GET as getContactInfo, PUT as putContactInfo } from '../../src/app/api/owner/contact-info/route';
import { POST as postSupportInquiry } from '../../src/app/api/organizer/contact-support/route';

describe('Organizer <-> Admin Contact Sync & Guide Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs contact info saved by owner to organizer GET /api/owner/contact-info', async () => {
    const updatedContact = {
      hotline: '089-111-2222',
      hotlineBadge: '24 ชม.',
      hotlineNote: 'ด่วน',
      email: 'ops@ticket.local',
      emailBadge: 'เร็ว',
      emailNote: 'ฝ่ายประสานงาน',
      lineId: '@ticket-ops',
      lineBadge: 'LINE',
      lineNote: 'แชท',
      operatingHours: '09:00 - 18:00',
      operatingHoursNote: 'จันทร์-ศุกร์',
      address: 'UBU',
      addressNote: 'สำนักงาน',
    };

    mockGetSession.mockResolvedValueOnce({
      user: { id: 'owner-1', role: 'owner', name: 'Owner' },
    });
    mockWriteOwnerContactInfo.mockResolvedValueOnce(undefined);

    const putReq = new Request('http://127.0.0.1:3000/api/owner/contact-info', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updatedContact),
    });
    const putRes = await putContactInfo(putReq);
    expect(putRes.status).toBe(200);
    expect(mockWriteOwnerContactInfo).toHaveBeenCalledWith(mockPool, updatedContact);

    mockGetSession.mockResolvedValueOnce({
      user: { id: 'org-1', role: 'organizer', name: 'Organizer' },
    });
    mockReadOwnerContactInfo.mockResolvedValueOnce(updatedContact);

    const getRes = await getContactInfo(new Request('http://127.0.0.1:3000/api/owner/contact-info'));
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.contact).toEqual(updatedContact);
  });

  it('syncs organizer inquiry to admin notifications via POST /api/organizer/contact-support', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'org-1', role: 'organizer', name: 'ชมรมดนตรี', email: 'org@ubu.ac.th' },
    });
    mockCreateNotification.mockResolvedValueOnce({ id: 'notif-123' });

    const req = new Request('http://127.0.0.1:3000/api/organizer/contact-support', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subject: 'ขอตรวจสอบรอบโอนเงิน',
        category: 'finance',
        message: 'รบกวนตรวจสอบยอดโอนรอบล่าสุดให้หน่อยครับ',
      }),
    });
    const res = await postSupportInquiry(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.notificationId).toBe('notif-123');
    expect(mockCreateNotification).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        role: 'owner',
        category: 'finance',
        title: 'ข้อความจากผู้จัดงาน: ขอตรวจสอบรอบโอนเงิน',
        referenceId: 'org-contact-org-1',
      }),
    );

    mockGetSession.mockResolvedValueOnce({
      user: { id: 'cust-1', role: 'customer', name: 'Buyer' },
    });
    const forbiddenRes = await postSupportInquiry(
      new Request('http://127.0.0.1:3000/api/organizer/contact-support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: 'Test', message: 'Hello' }),
      }),
    );
    expect(forbiddenRes.status).toBe(403);
  });

  it('uses outline buttons and updated scanner/offline/backup docs in #contact and #guide', () => {
    const rootDir = process.cwd();
    const contactSrc = readFileSync(join(rootDir, 'src/components/organizer-contact-view.tsx'), 'utf8');
    const guideSrc = readFileSync(join(rootDir, 'src/components/organizer-guide-view.tsx'), 'utf8');
    const cssSrc = readFileSync(join(rootDir, 'src/app/back-office/back-office.css'), 'utf8');

    expect(contactSrc).toContain('/api/organizer/contact-support');
    expect(contactSrc).toContain('settings-outline-btn-primary');
    expect(cssSrc).toMatch(/\.channel-action-btn\.btn-call\s*\{[^}]*background:\s*#ffffff/);

    expect(guideSrc).toContain('สำรองข้อมูล (.json)');
    expect(guideSrc).toContain('1 ลิงก์ต่อ 1 อุปกรณ์');
    expect(guideSrc).not.toContain('variant="primary"');
    expect(guideSrc).toContain('settings-outline-btn-sm');
  });
});
