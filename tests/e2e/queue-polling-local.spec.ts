import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { createIsolatedBrowserContext, testClientIp } from '../support/client-context';
import { reserveThroughCheckout } from '../support/purchase-journey';

test('real waiting queue polls until capacity releases and payment poll detects external completion', async ({ page, browser, request }, info) => {
  test.setTimeout(90000);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(info) });
  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/back-office/organizer');
  const created = await page.request.post('/api/events', { data: {
    title: `Real queue polling ${info.project.name} ${Date.now()}`, location: 'Local test hall',
    sessions: [{ startTime: new Date(Date.now() + 86400000).toISOString(), endTime: new Date(Date.now() + 100800000).toISOString(),
      ticketTypes: [{ name: 'Standing', price: 1000, quota: 50 }] }],
  } });
  expect(created.status()).toBe(201);
  const { event } = await created.json();
  const sessionId = event.sessions[0].id;
  expect((await page.request.post(`/api/events/${event.id}?action=submit-session`, { data: { sessionId } })).status()).toBe(200);
  const ownerContext = await createIsolatedBrowserContext(browser, info);
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto('/login');
  await ownerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
  await ownerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(ownerPage).toHaveURL('/back-office/owner');
  expect((await ownerPage.request.post('/api/owner/sessions', { data: { sessionId } })).status()).toBe(200);
  await ownerContext.close();
  const seeded = await request.get(`/api/auth/test-inspect-reset-token?type=seed_queue&eventId=${event.id}`);
  expect(seeded.status()).toBe(200);
  expect((await seeded.json()).seeded).toBe(200);
  const observations: { allowed: boolean; status: string; at: number; activeCount: number }[] = [];
  page.on('response', async response => {
    if (!response.url().includes(`/api/events/${event.id}/queue/status`)) return;
    const body = await response.json();
    observations.push({ allowed: body.allowed, status: body.status, at: response.request().timing().startTime, activeCount: body.activeCount });
  });
  await page.goto(`/events/${event.id}/queue`);
  await expect.poll(() => observations.filter(item => item.status === 'waiting').length, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
  const waiting = observations.filter(item => item.status === 'waiting');
  expect(waiting[0]).toMatchObject({ allowed: false, activeCount: 200 });
  expect(waiting[1].at - waiting[0].at).toBeGreaterThanOrEqual(2400);
  await expect(page.locator('#proceed-to-checkout-btn')).toBeDisabled();
  const released = await request.get(`/api/auth/test-inspect-reset-token?type=release_queue&eventId=${event.id}`);
  expect(released.status()).toBe(200);
  expect((await released.json()).released).toBe(200);
  await expect.poll(() => observations.some(item => item.allowed), { timeout: 20000 }).toBe(true);
  // The existing waiting room navigates automatically once the server admits us.
  await expect(page).toHaveURL(`/events/${event.id}/checkout`);
  const orderId = await reserveThroughCheckout(page, {
    eventId: event.id, buyer: { name: 'Polling buyer', email: `polling-${info.project.name}-${Date.now()}@ticket.invalid`, phone: '0812345678' },
    tickets: [{ name: 'Standing', quantity: 1 }],
  });
  const token = await page.evaluate(() => sessionStorage.getItem('ticket_guest_otp_token'));
  const paidPoll = page.waitForResponse(async response => {
    if (!response.url().endsWith(`/api/public/checkout/orders/${orderId}`) || response.request().method() !== 'GET') return false;
    return response.ok() && (await response.json()).reservation?.status === 'paid';
  }, { timeout: 20000 });
  const paid = await page.request.post(`/api/public/checkout/orders/${orderId}/pay-test`, {
    headers: token ? { 'x-guest-token': token } : {}, data: { providerPaidAt: new Date().toISOString() },
  });
  expect(paid.status()).toBe(200);
  expect((await (await paidPoll).json()).reservation.status).toBe('paid');
  await expect(page).toHaveURL(`/orders/${orderId}/success`);
  await expect(page.getByText('ออกบัตรสำเร็จแล้ว (1 ใบ)')).toBeVisible();
});
