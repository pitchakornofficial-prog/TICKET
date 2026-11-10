import { testClientIp } from '../support/client-context';
import { saveEventDraft } from '../support/event-draft';
import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { reserveThroughCheckout } from '../support/purchase-journey';

test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test.describe('Ticket Email Delivery flow (TASK-017, AC-20, AC-75)', () => {
  test('buyer pays order, tickets are issued and email delivery is triggered, owner views email delivery manager in back-office', async ({
    page,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ต ส่งตั๋วทางอีเมล ${testInfo.project.name}`;
    const guestEmail = `buyer-email-${testInfo.project.name}@ticket.invalid`;
    const guestName = `เกรียงไกร ส่งอีเมล ${testInfo.project.name}`;
    const guestPhone = '0865432109';

    // 1. Organizer logs in and creates event
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.goto('/back-office/organizer#events');
    await page.getByTestId('open-create-concert-btn').click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByRole('tab', { name: '2. สถานที่ & แผนที่' }).click();
    await page.locator('#event-location').fill('รอยัล พารากอน ฮอลล์');
    await saveEventDraft(page);
    await expect(page.locator('#create-concert-title')).toBeHidden();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Add session with quota = 20
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-12-20T19:00:00.000Z',
            endTime: '2026-12-20T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตร โซน VIP', price: 2500, quota: 20 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    const sessionId = updatedData.event.sessions[0].id;

    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 2. Owner logs in, approves session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติด่วน' }).click();
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 3. Guest completes purchase and reservation
    const orderId = await reserveThroughCheckout(page, {
      eventId: createdEvent.id,
      buyer: { name: guestName, email: guestEmail, phone: guestPhone },
      tickets: [{ name: 'บัตร โซน VIP', quantity: 2 }],
    });
    expect(orderId).toMatch(/^ORD-/);

    // 7. Click simulate payment success
    const simulateBtn = page.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.click();

    // 8. Assert Paid state & Ticket Issuance (AC-11, AC-17, AC-19)
    await expect(page.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await expect(page).toHaveURL(/\/orders\/ORD-[A-Z0-9-]+\/success$/);
    await expect(page.getByText('ออกบัตรสำเร็จแล้ว (2 ใบ)')).toBeVisible();
    await page.locator('#tab-btn-tickets').click();
    await expect(page.locator('.ticket-card')).toHaveCount(2);

    // 9. Owner logs into back-office and verifies Email Deliveries Manager exists and shows no failures
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');
    await page.goto('/back-office/owner#customer');

    await expect(page.getByRole('heading', { name: 'การจัดส่งอีเมลบัตรที่ล้มเหลว (AC-20, AC-75)' })).toBeVisible();
    await expect(page.getByText('ไม่มีรายการจัดส่งอีเมลที่ล้มเหลว ทุกคำสั่งซื้อจัดส่งสำเร็จเรียบร้อย')).toBeVisible();

    // 10. Design rules: zero emojis (D-14), responsive layout
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
