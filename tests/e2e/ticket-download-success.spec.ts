import { reserveThroughCheckout } from '../support/purchase-journey';
import { testClientIp } from '../support/client-context';
import { saveEventDraft } from '../support/event-draft';
import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.beforeEach(async ({ context }, testInfo) => {
  test.setTimeout(60000);
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test.describe('Dedicated Payment Success Page & Ticket Download (D-52)', () => {
  test('buyer completes payment, is redirected to dedicated success page, and can view/download 1200x500 classic ticket stubs', async ({
    page,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ตบัตรคลาสสิก ${testInfo.project.name}`;
    const guestEmail = `buyer-stub-${testInfo.project.name}@ticket.invalid`;
    const guestName = `วิศรุต ผู้รับบัตรคลาสสิก ${testInfo.project.name}`;
    const guestPhone = '0823456789';

    // 1. Organizer logs in and creates an event
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.goto('/back-office/organizer#events');
    await page.getByTestId('open-create-concert-btn').click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByRole('tab', { name: '2. สถานที่ & แผนที่' }).click();
    await page.locator('#event-location').fill('อิมแพ็ค อารีน่า เมืองทองธานี');
    await saveEventDraft(page);
    await expect(page.locator('#create-concert-title')).toBeHidden();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Update with session and custom ticket template URL
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        ticketTemplateUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500"><rect width="100%" height="100%" fill="%231e293b"/></svg>',
        sessions: [
          {
            startTime: '2026-12-25T19:00:00.000Z',
            endTime: '2026-12-25T22:00:00.000Z',
            ticketTypes: [{ name: 'บัตร Gold Seating A', price: 3000, quota: 50 }],
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

    // 2. Owner approves the session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติด่วน' }).click();
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 3. Guest visits concert page and enters queue
    await page.goto(`/events/${createdEvent.id}`);
    const enterQueueBtn = page.getByTestId('enter-queue-cta-btn').filter({ visible: true });
    await enterQueueBtn.click();
    await expect(page).toHaveURL(`/events/${createdEvent.id}/queue`);
    await page.locator('#proceed-to-checkout-btn').click();
    await expect(page).toHaveURL(`/events/${createdEvent.id}/checkout`);

    // 4. Select 2 tickets
    await reserveThroughCheckout(page, {
      eventId: createdEvent.id,
      buyer: { name: guestName, email: guestEmail, phone: guestPhone },
      tickets: [{ name: 'บัตร Gold Seating A', quantity: 2 }],
    });
    // A reserved order is fixed; payment offers no ticket/buyer editing controls.
    await expect(page.getByRole('button', { name: 'เพิ่มจำนวน บัตร Gold Seating A' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'แก้ไขข้อมูล / เลือกบัตรใหม่' })).toHaveCount(0);

    await expect(page).toHaveURL(/\/orders\/ORD-[A-Z0-9-]+\/payment$/);
    const orderId = (await page.locator('#reservation-order-id').innerText()).trim();

    // 7. PromptPay QR code (auto-generated) and simulate payment
    const qrImage = page.locator('#promptpay-qr-image');
    await expect(qrImage).toBeVisible({ timeout: 15000 });
    const simulateBtn = page.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.scrollIntoViewIfNeeded();
    await simulateBtn.click({ force: true });

    // 8. D-53: Assert redirection to Dedicated Payment Success Page with Clean Split Tabs
    await expect(page).toHaveURL(`/orders/${orderId}/success`);

    // Verify Tab 1 (Receipt Slip) is active by default
    await expect(page.getByText('ชำระเงินสำเร็จเรียบร้อย')).toBeVisible();
    await expect(page.getByText('ออกบัตรสำเร็จแล้ว (2 ใบ)')).toBeVisible();
    await expect(page.locator('#buyer-summary-name')).toHaveText(guestName);
    await expect(page.locator('#buyer-summary-email')).toHaveText(guestEmail);
    await expect(page.locator('#buyer-summary-phone')).toHaveText(guestPhone);
    await expect(page.locator('#quote-total')).toContainText('6,300');

    // Switch to Tab 2 (Dedicated Concert Tickets View) via CTA button
    const viewTicketsCta = page.locator('#slip-view-tickets-cta');
    await expect(viewTicketsCta).toBeVisible();
    await viewTicketsCta.click();

    // Verify Tickets Tab Header
    await expect(page.locator('#issued-tickets-count')).toHaveText('2');
    await expect(page.getByText('คุณมีบัตรคอนเสิร์ตทั้งหมด 2 ใบ')).toBeVisible();

    // Verify Classic Ticket Stub Card Layout (2.5:1 ratio)
    const stubs = page.locator('.classic-ticket-stub');
    await expect(stubs).toHaveCount(2);

    const firstStub = stubs.first();
    const directImg = firstStub.locator('.classic-ticket-img');

    // Verify direct image is rendered and has event title alt attribute (D-165, D-168)
    await expect(directImg).toBeVisible();
    await expect(directImg).toHaveAttribute('alt', new RegExp(eventTitle));

    // Verify Download Buttons (Single and Bulk)
    const downloadBtns = page.locator('.stub-download-btn');
    await expect(downloadBtns).toHaveCount(2);
    await expect(downloadBtns.first()).toContainText('บันทึกรูปบัตรใบที่ 1 (PNG 1200 x 500 px)');

    const downloadAllBtn = page.locator('.success-download-all-btn');
    await expect(downloadAllBtn).toBeVisible();
    await expect(downloadAllBtn).toContainText('บันทึกรูปบัตรทั้งหมดลงเครื่อง (2 ใบ)');

    // Switch back to Receipt Tab via Tab Bar
    const receiptTabBtn = page.locator('#tab-btn-receipt');
    await receiptTabBtn.click();
    await expect(page.getByText('ชำระเงินสำเร็จเรียบร้อย')).toBeVisible();

    // 9. Page reload on /orders/[id]/success retains tickets & status
    await page.reload();
    await expect(page).toHaveURL(`/orders/${orderId}/success`);
    await expect(page.locator('.classic-ticket-stub')).toHaveCount(2);

    // 10. D-54: Verify visiting /orders/[id]/payment for a paid order auto-redirects to /orders/[id]/success
    await page.goto(`/orders/${orderId}/payment`);
    await expect(page).toHaveURL(`/orders/${orderId}/success`);
    await expect(page.getByText('ชำระเงินสำเร็จเรียบร้อย')).toBeVisible();

    // 11. Constraints: zero emojis & responsive layout
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
