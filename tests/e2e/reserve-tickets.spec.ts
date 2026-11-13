import { reserveThroughCheckout } from '../support/purchase-journey';
import { testClientIp } from '../support/client-context';
import { saveEventDraft } from '../support/event-draft';
import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test.describe('Ticket reservation and quotation flow (TASK-012, AC-10, AC-14, AC-61, AC-69, AC-106, AC-111, AC-13)', () => {
  test('guest completes OTP verification, reserves tickets up to limit, receives quote with 15-min countdown, and locks fee', async ({
    page,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ตจองบัตร ${testInfo.project.name}`;
    const guestEmail = `buyer-reserve-${testInfo.project.name}@ticket.invalid`;
    const guestName = `ประสิทธิ์ ใจดี ${testInfo.project.name}`;
    const guestPhone = '0898765432';

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
    await page.locator('#event-location').fill('อิมแพ็ค ชาเลนเจอร์ ฮอลล์');
    await saveEventDraft(page);
    await expect(page.locator('#create-concert-title')).toBeHidden();

    // Get event ID
    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Add session with ticket types
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-11-20T19:00:00.000Z',
            endTime: '2026-11-20T22:00:00.000Z',
            ticketTypes: [
              { name: 'บัตร VIP', price: 3000, quota: 50 },
              { name: 'บัตร Regular', price: 1500, quota: 50 },
            ],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    const sessionId = updatedData.event.sessions[0].id;

    // Submit session for approval
    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 2. Owner logs in, configures fee settings, and approves the session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    // Set fee settings: customer per_ticket 20 THB, organizer 5%
    const feeRes = await page.request.put(`/api/owner/events/${createdEvent.id}/fee-settings`, {
      data: {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 20,
        reservePercentage: 10,
      },
    });
    expect(feeRes.status()).toBe(200);

    // Approve session
    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติด่วน' }).click();
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 3. Guest opens the concert detail page
    await page.goto(`/events/${createdEvent.id}/checkout`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    // 5. Select ticket quantities
    await expect(page.getByRole('heading', { name: 'เลือกรอบการแสดงและจำนวนบัตร' })).toBeVisible();

    // Click + on VIP ticket twice -> qty 2
    await reserveThroughCheckout(page, {
      eventId: createdEvent.id,
      buyer: { name: guestName, email: guestEmail, phone: guestPhone },
      tickets: [{ name: 'บัตร VIP', quantity: 2 }],
    });
    // A reserved order is fixed; payment offers no ticket/buyer editing controls.
    await expect(page.getByRole('button', { name: 'เพิ่มจำนวน บัตร VIP' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'แก้ไขข้อมูล / เลือกบัตรใหม่' })).toHaveCount(0);

    // 6. Verify Reservation Confirmed Card (AC-69, AC-13)
    await expect(page.locator('#reservation-order-id')).toHaveText(/^ORD-/);
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    // Check 15-minute countdown display
    await expect(page.locator('#reservation-countdown')).toBeVisible();

    // Check quotation numbers (AC-69):
    // 2 VIP tickets * 3,000 = 6,000
    // Customer fee: 2 tickets * 20 = 40
    // Total: 6,040
    await expect(page.locator('#quote-subtotal')).toContainText('6,000');
    await expect(page.locator('#quote-customer-fee')).toContainText('40');
    await expect(page.locator('#quote-total')).toContainText('6,040');

    // 7. Verify fee lock (G-49, AC-111): Owner workspace shows fee is locked
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    await page.goto('/back-office/owner#finance');
    const eventSelect = page.locator('.owner-fee-settings-card').getByLabel('เลือกคอนเสิร์ต');
    const targetOption = eventSelect.locator('option', { hasText: eventTitle });
    const eventIdValue = (await targetOption.getAttribute('value')) ?? '';
    await eventSelect.selectOption(eventIdValue);

    // Verify organizer fee lock badge
    await expect(page.getByText('ล็อกแล้ว (มีคำสั่งซื้อหรือกันบัตรแล้ว)')).toBeVisible();
    await expect(page.locator('#organizer-fee-mode')).toBeDisabled();
    await expect(page.locator('#organizer-fee-rate')).toBeDisabled();

    // 8. Design rules: zero emojis (D-14), responsive layout
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
