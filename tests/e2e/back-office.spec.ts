import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
// Independent journeys use distinct documentation-range client IP fixtures.
// Production login throttling remains enabled, including the library's stricter sign-in rule.
test.beforeEach(async ({ context }, testInfo) => {
  const offset = testInfo.project.name === 'desktop-chromium' ? 0 : 100;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${offset + nextIp++}` });
});

test('anonymous visitors cannot open workspaces or create an owner publicly', async ({ page, request }) => {
  await page.goto('/back-office/owner');
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบหลังบ้าน' })).toBeVisible();
  await expect(page.getByRole('link', { name: /สมัคร/ })).toHaveCount(0);
  const response = await request.post('/api/auth/sign-up/email', { data: { ...fixtureAccounts.owner, password: fixturePassword, role: 'owner' } });
  expect(response.status()).toBe(404);
});

test('login failure is visible without losing the form', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('incorrect fixture password');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeEnabled();
});

for (const [role, label] of [['owner', 'เจ้าของเว็บ'], ['organizer', 'ผู้จัดงาน'], ['scanner', 'ทีมสแกนบัตร']] as const) {
  test(`${role} has only its workspace, persisted login and revocable logout`, async ({ page }, testInfo) => {
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts[role].email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL(`/back-office/${role}`);
    await expect(page.getByRole('heading', { name: `พื้นที่${label}`, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(fixtureAccounts[role].name, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${role}-workspace.png`), fullPage: true });
    const other = role === 'owner' ? 'organizer' : 'owner';
    const denial = await page.goto(`/back-office/${other}`);
    expect(denial?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'ไม่พบหน้าหรือไม่มีสิทธิ์เข้าถึง' })).toBeVisible();
    await page.getByRole('link', { name: 'กลับพื้นที่ทำงาน' }).click();
    await expect(page).toHaveURL(`/back-office/${role}`);
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await page.goto(`/back-office/${role}`);
    await expect(page).toHaveURL('/login');
  });
}
