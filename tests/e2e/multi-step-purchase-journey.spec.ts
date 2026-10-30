import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  test.setTimeout(60000);
  const base = testInfo.project.name === 'desktop-chromium' ? 110 : 160;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 45)}` });
});

test.describe('Multi-step purchase journey: Details -> Queue -> Checkout -> Payment (TASK-040, AC-117, D-27)', () => {
  test('buyer navigates across 4 distinct pages with step indicator, waiting room queue, ticket selection + OTP, and PromptPay QR payment', async ({
    page,
    request,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ตแยกหน้า 4 ขั้นตอน ${testInfo.project.name}`;
    const guestEmail = `buyer-step-${testInfo.project.name}@ticket.invalid`;
    const guestName = `กิตติพงศ์ ผู้ซื้อบัตร ${testInfo.project.name}`;
    const guestPhone = '0812345678';

    // 1. Organizer logs in and creates an event with session
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค อารีน่า เมืองทองธานี');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-12-20T19:00:00.000Z',
            endTime: '2026-12-20T22:00:00.000Z',
            ticketTypes: [
              { name: 'บัตร Standing Zone A', price: 2500, quota: 50 },
              { name: 'บัตร Seating Zone B', price: 1500, quota: 50 },
            ],
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

    // 2. Owner approves the session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click();
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // =========================================================================
    // STEP 1: Event Details Page (/events/[id])
    // =========================================================================
    await page.goto(`/events/${createdEvent.id}`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();
    await expect(page.getByTestId('purchase-step-indicator')).toBeVisible();

    // Ensure Step 1 is active
    await expect(
      page.locator('.purchase-step-item.step-active'),
    ).toContainText('1');

    // Click CTA to enter Queue Waiting Room (single visible button on desktop sidebar or mobile bar)
    const enterQueueBtn = page.getByTestId('enter-queue-cta-btn').filter({ visible: true });
    await expect(enterQueueBtn).toBeVisible();
    await enterQueueBtn.click();

    // =========================================================================
    // STEP 2: Queue Waiting Room Page (/events/[id]/queue)
    // =========================================================================
    await expect(page).toHaveURL(`/events/${createdEvent.id}/queue`);
    await expect(page.getByTestId('queue-waiting-card')).toBeVisible();
    await expect(page.locator('#queue-number-display')).toContainText('A-');
    await expect(
      page.locator('.purchase-step-item.step-active'),
    ).toContainText('2');

    // Proceed to Checkout page
    await page.locator('#proceed-to-checkout-btn').click();

    // =========================================================================
    // STEP 3: Ticket Selection & Buyer Info + OTP Page (/events/[id]/checkout)
    // =========================================================================
    await expect(page).toHaveURL(`/events/${createdEvent.id}/checkout`);
    await expect(
      page.locator('.purchase-step-item.step-active'),
    ).toContainText('2');
    await expect(page.locator('#checkout-queue-badge')).toContainText('ผ่านคิวแล้ว');

    // 3a. Select 2 tickets first (Card 1)
    const addStandingBtn = page.getByRole('button', { name: 'เพิ่มจำนวน บัตร Standing Zone A' });
    await addStandingBtn.click();
    await addStandingBtn.click();
    await expect(page.getByText('รวมราคาบัตร (2 ใบ)')).toBeVisible();

    // 3b. Fill Buyer Info & Verify OTP (Card 2)
    await page.getByLabel('ชื่อ-นามสกุล *').fill(guestName);
    await page.getByLabel('อีเมล *').fill(guestEmail);
    await page.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(guestPhone);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();

    await expect(page.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    expect(otpRes.status()).toBe(200);
    const { code } = await otpRes.json();

    await page.getByLabel('รหัส OTP 6 หลัก *').fill(code);
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();

    // D-46: Pre-verification confirmation modal appears before permanent lock
    await expect(page.getByRole('heading', { name: 'ยืนยันข้อมูลคำสั่งซื้อและการล็อกสิทธิ์' })).toBeVisible();
    await page.getByRole('button', { name: 'ยืนยันและดำเนินการต่อ' }).click();

    await expect(page.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    // D-43 & D-46: Ticket selection is permanently locked; edit button is removed
    await expect(page.getByRole('button', { name: 'เพิ่มจำนวน บัตร Standing Zone A' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'ลดจำนวน บัตร Standing Zone A' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'แก้ไขข้อมูล / เลือกบัตรใหม่' })).toHaveCount(0);

    // 3c. Confirm Reservation -> Redirects to Step 4 Payment Page
    const confirmReserveBtn = page.locator('#confirm-reservation-btn');
    await expect(confirmReserveBtn).toBeEnabled();
    await confirmReserveBtn.scrollIntoViewIfNeeded();
    await confirmReserveBtn.click({ force: true });

    // =========================================================================
    // STEP 4: Payment & Ticket Issuance Page (/orders/[id]/payment)
    // =========================================================================
    await expect(page).toHaveURL(/\/orders\/ORD-[A-Z0-9-]+\/payment$/);
    await expect(
      page.locator('.purchase-step-item.step-active'),
    ).toContainText('3');

    // Verify 15-minute countdown and price breakdown
    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();
    await expect(page.locator('#reservation-countdown')).toBeVisible();
    await expect(page.locator('#payment-sticky-countdown')).toBeVisible();
    await expect(page.locator('.payment-sticky-bottom-bar')).toBeVisible();
    await expect(page.locator('#quote-subtotal')).toContainText('5,000');

    // PromptPay QR Code (D-48: Auto-generated or manual fallback)
    const qrImage = page.locator('#promptpay-qr-image');
    const generateQrBtn = page.locator('#generate-payment-qr-btn');
    if (await generateQrBtn.isVisible()) {
      await generateQrBtn.click({ force: true });
    }
    await expect(qrImage).toBeVisible({ timeout: 10000 });
    const simulateBtn = page.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.scrollIntoViewIfNeeded();
    await simulateBtn.click({ force: true });

    // Verify Paid status and issued digital tickets
    await expect(page.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await expect(page.getByText('ออกบัตรสำเร็จแล้ว (2 ใบ)')).toBeVisible();
    await expect(page.locator('.ticket-card')).toHaveCount(2);
    await expect(page.locator('.payment-sticky-bottom-bar')).toHaveCount(0);

    // D-43: Verify 15-minute countdown expiry notice banner on concert detail page
    await page.goto(`/events/${createdEvent.id}?expired=true`);
    await expect(page.locator('.event-expired-alert-banner')).toBeVisible();
    await expect(
      page.getByText('หมดเวลาทำรายการ 15 นาที ระบบได้คืนโควตาบัตรแล้ว กรุณาเริ่มทำรายการใหม่อีกครั้ง'),
    ).toBeVisible();

    // Zero emojis and no horizontal overflow
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('displays universal timeout modal when 15-minute window expires and redirects to event detail page (D-49)', async ({
    page,
    request: _request,
  }, testInfo) => {
    const eventTitle = `คอนเสิร์ต Timeout Modal ${testInfo.project.name}`;

    // 1. Organizer logs in and creates event
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค ชาเลนเจอร์ ฮอลล์');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-11-20T19:00:00.000Z',
            endTime: '2026-11-20T22:00:00.000Z',
            ticketTypes: [{ name: 'Standing Zone A', price: 2500, quota: 100 }],
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

    // Owner approves session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click();
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();

    // Navigate to event page and enter queue
    await page.goto(`/events/${createdEvent.id}`);
    const enterQueueBtn = page.getByTestId('enter-queue-cta-btn').filter({ visible: true });
    await enterQueueBtn.click();
    await expect(page).toHaveURL(`/events/${createdEvent.id}/queue`);
    await page.locator('#proceed-to-checkout-btn').click();
    await expect(page).toHaveURL(`/events/${createdEvent.id}/checkout`);

    // Simulate expired deadline in sessionStorage
    await page.evaluate((id) => {
      sessionStorage.setItem(`ticket_checkout_deadline_${id}`, (Date.now() - 5000).toString());
    }, createdEvent.id);

    // Reload page to trigger expired check on mount
    await page.reload();

    // Verify Timeout Modal is visible (D-49)
    const modal = page.locator('.timeout-modal-overlay');
    await expect(modal).toBeVisible();
    await expect(page.locator('#timeout-modal-title')).toHaveText('หมดเวลาทำรายการ 15 นาที');
    await expect(page.locator('.timeout-countdown-note')).toBeVisible();

    // Click redirect button
    const redirectBtn = page.locator('#timeout-modal-redirect-btn');
    await expect(redirectBtn).toBeVisible();
    await redirectBtn.click();

    // Verify redirected back to event detail page with expired banner
    await expect(page).toHaveURL(`/events/${createdEvent.id}?expired=true`);
    await expect(page.locator('.event-expired-alert-banner')).toBeVisible();

    // Zero emojis test
    expect(await page.locator('body').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
