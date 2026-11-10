import { testClientIp } from '../support/client-context';
import { saveEventDraft } from '../support/event-draft';
import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test('organizer logs in, creates a concert draft with poster and views it in their workspace', async ({ page }, testInfo) => {
  const eventTitle = `งานดนตรีฤดูหนาว ${testInfo.project.name}`;
  const location = `เชียงใหม่ ฮอลล์ ${testInfo.project.name}`;

  // 1. Organizer logs in
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/organizer');

  // 2. Open create event form
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByTestId('organizer-mobile-menu-toggle').click();
  }
  await page.getByTestId('organizer-nav-events').click();
  await expect(page.getByRole('heading', { name: 'งานคอนเสิร์ตของคุณ' })).toBeVisible();
  await page.getByTestId('open-create-concert-btn').click();

  // 3. Fill event details
  await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
  await page.getByLabel('เกี่ยวกับคอนเสิร์ตนี้ / รายละเอียดและจุดเด่น').fill('เทศกาลดนตรีฤดูหนาวประจำปี');
  await page.getByRole('tab', { name: '2. สถานที่ & แผนที่' }).click();
  await page.locator('#event-location').fill(location);

  // Upload dummy poster in the media step
  await page.getByRole('tab', { name: '5. รูปภาพ & สื่อ' }).click();
  await page.locator('#event-poster').setInputFiles({
    name: 'test-poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake-png-content'),
  });

  await saveEventDraft(page);

  // 4. Verify draft appears in organizer workspace with poster
  await expect(page.locator('#create-concert-title')).toBeHidden();
  const card = page.locator('.event-card', { hasText: eventTitle });
  await expect(card).toBeVisible();
  await expect(card.getByText(`สถานที่: ${location}`)).toBeVisible();
  await expect(card.getByText(/สถานะ:\s*(draft|ฉบับร่าง)/)).toBeVisible();

  await expect(card.getByRole('button', { name: 'แก้ไขข้อมูล' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'ส่งขออนุมัติ' })).toBeVisible();
});
