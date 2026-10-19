import { expect, test } from '@playwright/test';
import { resetAccounts } from '../support/auth-fixture';
import { clearCapturedEmails } from '../../src/server/email';

let nextIp = 200;
test.beforeEach(async ({ context }, testInfo) => {
  const offset = testInfo.project.name === 'desktop-chromium' ? 0 : 50;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${offset + nextIp++}` });
});

test('forgot password gives generic response for existing and non-existing email', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { name: 'ลืมรหัสผ่านหลังบ้าน' })).toBeVisible();

  // Non-existing email
  await page.getByLabel('อีเมลบัญชีหลังบ้าน').fill('unknown@ticket.invalid');
  await page.getByRole('button', { name: 'ส่งลิงก์ตั้งรหัสผ่านใหม่' }).click();
  await expect(page.locator('#forgot-success')).toContainText('หากอีเมลนี้มีอยู่ในระบบ');

  // Existing email
  await page.getByLabel('อีเมลบัญชีหลังบ้าน').fill(resetAccounts.owner.email);
  await page.getByRole('button', { name: 'ส่งลิงก์ตั้งรหัสผ่านใหม่' }).click();
  await expect(page.locator('#forgot-success')).toContainText('หากอีเมลนี้มีอยู่ในระบบ');
});

for (const [role, label] of [['owner', 'เจ้าของเว็บ'], ['organizer', 'ผู้จัดงาน'], ['scanner', 'ทีมสแกนบัตร']] as const) {
  test(`${role} completes password reset and logs in with new password`, async ({ page, request }) => {
    clearCapturedEmails();
    const account = resetAccounts[role];

    // Clear cooldown for test repeatability across browsers
    await request.get(`/api/auth/test-inspect-reset-token?clearCooldown=true&email=${encodeURIComponent(account.email)}`);

    // Request reset via UI form on /forgot-password
    await page.goto('/forgot-password');
    await page.getByLabel('อีเมลบัญชีหลังบ้าน').fill(account.email);
    await page.getByRole('button', { name: 'ส่งลิงก์ตั้งรหัสผ่านใหม่' }).click();
    await expect(page.locator('#forgot-success')).toContainText('หากอีเมลนี้มีอยู่ในระบบ');

    // Retrieve token via inspection endpoint from server database
    const tokenRes = await request.get(`/api/auth/test-inspect-reset-token?email=${encodeURIComponent(account.email)}`);
    expect(tokenRes.status()).toBe(200);
    const { token } = await tokenRes.json();
    expect(token).toBeTruthy();

    // Visit reset password page with token
    await page.goto(`/reset-password?token=${token}`);
    await expect(page.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่' })).toBeVisible();

    const newPassword = `New-Secure-Password!${role}003`;
    await page.getByLabel('รหัสผ่านใหม่ (อย่างน้อย 15 ตัวอักษร)').fill(newPassword);
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(newPassword);
    await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();

    // Check success notification
    await expect(page.getByText('ตั้งรหัสผ่านใหม่สำเร็จ')).toBeVisible();

    // Go to login and log in with new password
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(account.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();

    // Verify workspace accessed
    await expect(page).toHaveURL(`/back-office/${role}`);
    await expect(page.getByRole('heading', { name: `พื้นที่${label}`, exact: true })).toBeVisible();
  });
}
