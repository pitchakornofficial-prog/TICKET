import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 400;
test.beforeEach(async ({ context }, testInfo) => {
  const offset = testInfo.project.name === 'desktop-chromium' ? 0 : 50;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${offset + nextIp++}` });
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
  await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();

  // 3. Fill event details
  await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
  await page.getByLabel('สถานที่จัดงาน').fill(location);
  await page.getByLabel('รายละเอียด').fill('เทศกาลดนตรีฤดูหนาวประจำปี');

  // Upload dummy poster
  await page.getByLabel('โปสเตอร์งาน').setInputFiles({
    name: 'test-poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake-png-content'),
  });

  await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();

  // 4. Verify draft appears in organizer workspace with poster
  await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();
  const card = page.locator('.event-card', { hasText: eventTitle });
  await expect(card).toBeVisible();
  await expect(card.getByText(`สถานที่: ${location}`)).toBeVisible();
  await expect(card.getByText('สถานะ: draft')).toBeVisible();

  const storefrontLink = card.getByRole('link', { name: 'หน้าร้านลูกค้า' });
  await expect(storefrontLink).toBeVisible();
  await expect(storefrontLink).toHaveAttribute('href', /^\/events\//);
});
