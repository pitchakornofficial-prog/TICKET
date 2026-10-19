import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { clearCapturedEmails } from '../../src/server/email';

let nextIp = 300;
test.beforeEach(async ({ context }, testInfo) => {
  const offset = testInfo.project.name === 'desktop-chromium' ? 0 : 50;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${offset + nextIp++}` });
});

test('owner invites organizer, recipient accepts invitation and logs in as organizer without owner privilege', async ({ page, request }, testInfo) => {
  clearCapturedEmails();
  const invitedEmail = `invited-${testInfo.project.name}@ticket.invalid`;
  const organizerName = `ผู้จัดงานคอนเสิร์ต ${testInfo.project.name}`;
  const organizerPassword = `Organizer-Secret-Password!${testInfo.project.name}004`;

  // 1. Owner logs in
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/owner');

  // 2. Owner invites a new organizer
  await expect(page.getByRole('heading', { name: 'เชิญผู้จัดงานใหม่' })).toBeVisible();
  await page.getByLabel('อีเมลผู้จัดงาน').fill(invitedEmail);
  await page.getByRole('button', { name: 'ส่งคำเชิญผู้จัดงาน' }).click();
  await expect(page.locator('#invite-success')).toContainText(`ส่งคำเชิญไปยัง ${invitedEmail} สำเร็จ`);

  // 3. Retrieve token via test inspection endpoint
  const tokenRes = await request.get(`/api/auth/test-inspect-reset-token?type=invitation&email=${encodeURIComponent(invitedEmail)}`);
  expect(tokenRes.status()).toBe(200);
  const { token } = await tokenRes.json();
  expect(token).toBeTruthy();

  // 4. Owner logs out
  await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
  await expect(page).toHaveURL('/login');

  // 5. Recipient opens invitation link
  await page.goto(`/accept-invitation?token=${token}`);
  await expect(page.getByRole('heading', { name: 'ตอบรับคำเชิญผู้จัดงาน' })).toBeVisible();
  await expect(page.getByLabel('อีเมลคำเชิญ')).toHaveValue(invitedEmail);

  // Fill organizer details and password
  await page.getByLabel('ชื่อผู้จัดงาน / องค์กร').fill(organizerName);
  await page.getByLabel('รหัสผ่าน (อย่างน้อย 15 ตัวอักษร)').fill(organizerPassword);
  await page.getByLabel('ยืนยันรหัสผ่าน').fill(organizerPassword);
  await page.getByRole('button', { name: 'ยอมรับคำเชิญและสร้างบัญชี' }).click();

  await expect(page.getByText('ตั้งบัญชีผู้จัดงานสำเร็จ')).toBeVisible();

  // 6. Recipient logs in with new credentials
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(invitedEmail);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(organizerPassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();

  // 7. Verify logged in to organizer workspace
  await expect(page).toHaveURL('/back-office/organizer');
  await expect(page.getByRole('heading', { name: 'พื้นที่ผู้จัดงาน', exact: true })).toBeVisible();
  await expect(page.getByText(organizerName, { exact: true })).toBeVisible();

  // 8. Verify organizer cannot access owner workspace (has no owner privilege)
  const ownerPageRes = await page.goto('/back-office/owner');
  expect(ownerPageRes?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'ไม่พบหน้าหรือไม่มีสิทธิ์เข้าถึง' })).toBeVisible();
});
