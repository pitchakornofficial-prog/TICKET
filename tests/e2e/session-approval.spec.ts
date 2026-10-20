import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 500;
test.beforeEach(async ({ context }, testInfo) => {
  const offset = testInfo.project.name === 'desktop-chromium' ? 0 : 50;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${offset + nextIp++}` });
});

test('organizer submits two sessions, owner approves one session, and only approved session appears (AC-02, AC-66)', async ({ page }, testInfo) => {
  const eventTitle = `คอนเสิร์ตแยกอนุมัติรอบ ${testInfo.project.name}`;

  // 1. Organizer logs in via UI
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/organizer');

  // Create event with two sessions
  await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
  await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
  await page.getByLabel('สถานที่จัดงาน').fill('เอ็มแคปปิตอล ฮอลล์');
  await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
  await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

  // Find created event in DB or API to get session ids and submit session 1
  const eventsRes = await page.request.get('/api/events');
  expect(eventsRes.status()).toBe(200);
  const { events } = await eventsRes.json();
  const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
  expect(createdEvent).toBeDefined();

  // Add a second session to the draft via PUT
  const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
    data: {
      sessions: [
        {
          startTime: '2026-12-25T18:00:00.000Z',
          endTime: '2026-12-25T21:00:00.000Z',
          ticketTypes: [{ name: 'รอบคริสต์มาส', price: 2500, quota: 50 }],
        },
        {
          startTime: '2026-12-26T18:00:00.000Z',
          endTime: '2026-12-26T21:00:00.000Z',
          ticketTypes: [{ name: 'รอบวันถัดไป', price: 2000, quota: 50 }],
        },
      ],
    },
  });
  expect(updateRes.status()).toBe(200);
  const updatedData = await updateRes.json();
  const session1Id = updatedData.event.sessions[0].id;
  const session2Id = updatedData.event.sessions[1].id;

  // Submit session 1 for approval
  const submitRes = await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
    data: { sessionId: session1Id },
  });
  expect(submitRes.status()).toBe(200);

  // Logout organizer
  await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
  await expect(page).toHaveURL('/login');

  // 2. Owner logs in via UI and approves session 1
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/owner');

  // Verify pending session card is visible
  await expect(page.getByRole('heading', { name: 'รอบการแสดงที่รอการอนุมัติ (Owner Review)' })).toBeVisible();
  const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
  await expect(sessionCard).toBeVisible();

  // Approve session 1
  await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click();
  await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

  // 3. Check public API endpoint: only session 1 is approved; session 2 is not present
  const publicRes = await page.request.get(`/api/public/events/${createdEvent.id}`);
  expect(publicRes.status()).toBe(200);
  const publicData = await publicRes.json();
  expect(publicData.event.sessions).toHaveLength(1);
  expect(publicData.event.sessions[0].id).toBe(session1Id);
  expect(publicData.event.sessions[0].id).not.toBe(session2Id);
});
