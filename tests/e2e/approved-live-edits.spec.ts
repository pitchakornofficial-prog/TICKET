import { saveEventDraft } from '../support/event-draft';
import { expect, test } from '@playwright/test';
import { reserveThroughCheckout } from '../support/purchase-journey';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 160 : 210;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 40)}` });
});

test.describe('Approved live session edits & quota protection (TASK-024, AC-67, AC-68, AC-109)', () => {
  test('handles amendment workflow, protects existing reservation quote, updates new buyer price, and rejects quota below held rights', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(90000);
    const eventTitle = `คอนเสิร์ตแก้ไขรอบสด ${testInfo.project.name}`;
    const buyer1Email = `buyer1-amd-${testInfo.project.name}@ticket.invalid`;
    const buyer2Email = `buyer2-amd-${testInfo.project.name}@ticket.invalid`;

    // 1. Organizer logs in and creates event with session (price: 1,000 THB, quota: 20)
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    const mobileMenu = page.getByRole('button', { name: 'เมนูผู้จัดงาน' });
    if (await mobileMenu.isVisible()) await mobileMenu.click();
    await page.getByRole('button', { name: 'คอนเสิร์ต', exact: true }).click();
    await page.getByTestId('open-create-concert-btn').click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByRole('tab', { name: '2. สถานที่ & แผนที่' }).click();
    await page.locator('#event-location').fill('รอยัล พารากอน ฮอลล์');
    await saveEventDraft(page);

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-12-10T19:00:00.000Z',
            endTime: '2026-12-10T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตร Regular Standard', price: 1000, quota: 20 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    const sessionId = updatedData.event.sessions[0].id;
    const ticketTypeId = updatedData.event.sessions[0].ticketTypes[0].id;

    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 2. Owner logs in, approves session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติด่วน' }).click({ force: true });
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 3. Buyer 1 reserves and buys 2 tickets at 1,000 THB in isolated buyerContext
    const buyerContext = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.99' },
    });
    const buyerPage = await buyerContext.newPage();

    await reserveThroughCheckout(buyerPage, {
      eventId: createdEvent.id,
      buyer: { name: 'ผู้ซื้อท่านที่หนึ่ง', email: buyer1Email, phone: '0811111111' },
      tickets: [{ name: 'บัตร Regular Standard', quantity: 2 }],
    });
    await buyerPage.locator('#simulate-payment-button').click();
    await expect(buyerPage).toHaveURL(/\/orders\/ORD-[A-Z0-9-]+\/success$/);
    await expect(buyerPage.getByText('ออกบัตรสำเร็จแล้ว (2 ใบ)')).toBeVisible();

    // A separate checkout holds one ticket at the original price.
    const buyer2OrderId = await reserveThroughCheckout(buyerPage, {
      eventId: createdEvent.id,
      buyer: { name: 'ผู้ซื้อท่านที่สอง', email: buyer2Email, phone: '0822222222' },
      tickets: [{ name: 'บัตร Regular Standard', quantity: 1 }],
    });
    const buyer2Token = await buyerPage.evaluate(() => sessionStorage.getItem('ticket_guest_otp_token'));
    const originalOrderResponse = await request.get(`/api/public/checkout/orders/${buyer2OrderId}`, {
      headers: buyer2Token ? { 'x-guest-token': buyer2Token } : {},
    });
    expect(originalOrderResponse.status()).toBe(200);
    const originalOrder = await originalOrderResponse.json();
    expect(Number(originalOrder.reservation.subtotal)).toBe(1000);

    // 5. Organizer submits amendment via UI on admin page
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.goto('/back-office/organizer#events');

    // Open amendment form
    await page.locator(`[data-testid="open-amendment-btn-${createdEvent.id}"]`).click({ force: true });
    await expect(page.getByRole('heading', { name: /ขอแก้ไขรอบการแสดง:/ })).toBeVisible();

    // First verify AC-109 rejection on low quota (< heldQuota 3)
    await page.locator(`[data-testid="amendment-quota-${ticketTypeId}"]`).fill('2');
    await page.locator('[data-testid="submit-amendment-btn"]').click();
    await expect(page.getByText(/น้อยกว่าจำนวนสิทธิ์ที่จำหน่ายหรือกันไว้แล้ว/)).toBeVisible();

    // Now fill valid amendment: price 1,800, quota 25
    await page.locator(`[data-testid="amendment-price-${ticketTypeId}"]`).fill('1800');
    await page.locator(`[data-testid="amendment-quota-${ticketTypeId}"]`).fill('25');
    await page.locator('[data-testid="submit-amendment-btn"]').click();
    await expect(page.getByText(/ยื่นคำขอแก้ไขรอบการแสดงสำเร็จ/)).toBeVisible();
    await page.getByRole('button', { name: 'ปิดหน้าต่าง', exact: true }).click();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 6. While amendment is pending: public page still shows 1,000 THB (AC-67, G-12)
    const publicBeforeRes = await page.request.get(`/api/public/events/${createdEvent.id}`);
    expect(publicBeforeRes.status()).toBe(200);
    const publicBeforeData = await publicBeforeRes.json();
    expect(Number(publicBeforeData.event.sessions[0].ticketTypes[0].price)).toBe(1000);

    // 7. A separate operator login uses its own client IP, keeping the real
    // sign-in rate limiter enabled for the application.
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': '198.51.100.159' });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    // Check amendment card
    await expect(
      page.getByRole('heading', { name: 'คำขอแก้ไขรอบที่เปิดขายอยู่ คำขอปรับเปลี่ยนราคาและโซนที่รออนุมัติ (Live Session Amendments)' }),
    ).toBeVisible();
    await expect(page.getByText('฿1,000.00 →')).toBeVisible();
    await expect(page.getByText('฿1,800.00')).toBeVisible();

    // Click approve amendment
    const approveBtn = page.getByRole('button', { name: 'อนุมัติการแก้ไขราคา' });
    await approveBtn.scrollIntoViewIfNeeded();
    await approveBtn.dispatchEvent('click');
    await expect(page.getByText(/อนุมัติการแก้ไขรอบของ/)).toBeVisible({ timeout: 10000 });

    // Issued tickets remain accounted at their purchased price after approval.
    const reportResponse = await page.request.get(`/api/owner/events/${createdEvent.id}/money-report`);
    expect(reportResponse.status()).toBe(200);
    expect((await reportResponse.json()).report.grossSales).toBe(2000);

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 8. Public session now reflects updated price 1,800 THB (AC-67)
    await buyerContext.clearCookies();
    await buyerPage.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    await buyerPage.goto(`/events/${createdEvent.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle, exact: true })).toBeVisible();
    await expect(buyerPage.getByText('฿1,800.00').first()).toBeVisible();

    // 9. Buyer 2's pre-existing active reservation retains original 1,000 THB quote throughout 15-minute hold (AC-68)
    const orderCheckRes = await request.get(`/api/public/checkout/orders/${buyer2OrderId}`, {
      headers: buyer2Token ? { 'x-guest-token': buyer2Token } : {},
    });
    expect(orderCheckRes.status()).toBe(200);
    const orderData = await orderCheckRes.json();
    expect(Number(orderData.reservation.subtotal)).toBe(1000);
    expect(Number(orderData.reservation.total)).toBe(Number(originalOrder.reservation.total));

    await buyerContext.close();
  });
});
