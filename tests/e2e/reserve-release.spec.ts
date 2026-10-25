import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 182 : 232;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 40)}` });
});

test.describe('Reserve release after final session: calculation, release, and role protection (TASK-030, AC-83)', () => {
  test('owner releases held reserve to payable amount after final session ends; role isolation and no double release', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    const eventTitle = `คอนเสิร์ต ปล่อยเงินสำรอง ${testInfo.project.name} ${Date.now()}`;
    const buyerEmail = `buyer-rr-${testInfo.project.name}@ticket.invalid`;
    const buyerPhone = '0812345678';
    const buyerName = 'คุณวิชัย ปล่อยสำรอง';

    const now = Date.now();
    const session1Start = new Date(now - 48 * 3600 * 1000).toISOString();
    const session1End = new Date(now - 44 * 3600 * 1000).toISOString();
    const session2Start = new Date(now - 24 * 3600 * 1000).toISOString();
    const session2End = new Date(now - 20 * 3600 * 1000).toISOString();

    // 1. Organizer logs in and creates event with two past sessions
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค อารีน่า');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible();

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const createdEvent = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(createdEvent).toBeDefined();

    // Configure 2 sessions: each 1,000 THB ticket
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: session1Start,
            endTime: session1End,
            ticketTypes: [{ name: 'Regular Round 1', price: 1000, quota: 10 }],
          },
          {
            startTime: session2Start,
            endTime: session2End,
            ticketTypes: [{ name: 'Regular Round 2 (Final)', price: 1000, quota: 10 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    const session1Id = updatedData.event.sessions[0].id;
    const session2Id = updatedData.event.sessions[1].id;

    // Submit both sessions for owner approval
    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId: session1Id },
    });
    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId: session2Id },
    });

    // 2. Owner approves both sessions and sets fee settings (10% organizer fee, 10% reserve)
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/login');
    await ownerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await ownerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(ownerPage).toHaveURL('/back-office/owner');

    // Approve both sessions via owner API directly
    const approve1 = await ownerPage.request.post('/api/owner/sessions', {
      data: { sessionId: session1Id },
    });
    expect(approve1.status()).toBe(200);

    const approve2 = await ownerPage.request.post('/api/owner/sessions', {
      data: { sessionId: session2Id },
    });
    expect(approve2.status()).toBe(200);

    const feeConfigRes = await ownerPage.request.put(`/api/owner/events/${createdEvent.id}/fee-settings`, {
      data: {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 10,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 0,
        reservePercentage: 10,
      },
    });
    expect(feeConfigRes.status()).toBe(200);

    // 3. Buyer purchases 1 ticket for 1,000 THB in Session 1
    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto(`/events/${createdEvent.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle })).toBeVisible();

    await buyerPage.getByLabel('ชื่อ-นามสกุล *').fill(buyerName);
    await buyerPage.getByLabel('อีเมล *').fill(buyerEmail);
    await buyerPage.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(buyerPhone);
    await buyerPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();

    await expect(buyerPage.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(buyerEmail)}`,
    );
    expect(otpRes.status()).toBe(200);
    const { code } = await otpRes.json();

    await buyerPage.getByLabel('รหัส OTP 6 หลัก *').fill(code);
    await buyerPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(buyerPage.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    // Select 1 ticket for Regular Round 1
    const addBtn = buyerPage.getByRole('button', { name: 'เพิ่มจำนวน Regular Round 1' });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const confirmBtn = buyerPage.getByRole('button', { name: /ยืนยันการเลือกบัตร/ });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click({ force: true });
    await expect(buyerPage.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    // Generate PromptPay QR
    const generateQrBtn = buyerPage.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' });
    await expect(generateQrBtn).toBeVisible();
    await generateQrBtn.click({ force: true });

    await expect(buyerPage.locator('#promptpay-qr-image')).toBeVisible();
    const simulateBtn = buyerPage.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.scrollIntoViewIfNeeded();
    await simulateBtn.dispatchEvent('click');

    await expect(buyerPage.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible({ timeout: 25000 });
    await buyerContext.close();

    // 4. Owner verifies initial accounting and pays out 810 THB
    // E = 900, Reserve target = 90, Held H = 90, Payable = 810, Paid = 0
    await ownerPage.goto('/back-office/owner');
    await ownerPage.locator('[data-testid="owner-nav-finance"]').click();
    const payoutManager = ownerPage.locator('[data-testid="owner-weekly-payout-manager"]');
    await expect(payoutManager).toBeVisible();

    const payoutSelect = payoutManager.locator('#payout-event-select');
    await payoutSelect.selectOption(createdEvent.id);

    await expect(payoutManager.locator('[data-testid="owner-payable-amount"]')).toContainText('810.00');

    // Owner records payout of 810 THB
    await payoutManager.locator('#submit-payout-btn').click({ force: true });
    await expect(ownerPage.getByText('บันทึกการโอนเงินสำเร็จเรียบร้อย')).toBeVisible();

    // Payout manager now shows Payable = 0.00, Paid = 810.00, Held = 90.00
    await expect(payoutManager.locator('[data-testid="owner-payable-amount"]')).toContainText('0.00');
    await expect(payoutManager.locator('[data-testid="owner-total-paid-out"]')).toContainText('810.00');

    // 5. Owner navigates to Reserve Release Manager (TASK-030, AC-83)
    const reserveManager = ownerPage.locator('[data-testid="owner-reserve-release-manager"]');
    await expect(reserveManager).toBeVisible();

    const reserveSelect = reserveManager.locator('#owner-reserve-release-event-select');
    await reserveSelect.selectOption(createdEvent.id);

    // Final session is in past -> badge indicates final session has ended
    const statusBadge = reserveManager.locator('[data-testid="final-session-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 20000 });
    await expect(statusBadge).toContainText('จบรอบสุดท้ายแล้ว');

    // Check Held Reserve H = 90.00, Payable = 0.00
    const heldAmount = reserveManager.locator('[data-testid="owner-held-reserve-amount"]');
    await expect(heldAmount).toContainText('90.00');

    const payableBeforeRelease = reserveManager.locator('[data-testid="owner-payable-after-release"]');
    await expect(payableBeforeRelease).toContainText('0.00');

    // Submit reserve release of 90 THB
    const submitReleaseBtn = reserveManager.locator('#submit-reserve-release-btn');
    await expect(submitReleaseBtn).toBeEnabled();
    await submitReleaseBtn.click({ force: true });

    // Verify feedback message
    await expect(ownerPage.getByText('สั่งปล่อยเงินสำรองสำเร็จเรียบร้อยจำนวน ฿90.00')).toBeVisible();

    // Verify updated amounts:
    // Held Reserve H becomes 0.00
    await expect(heldAmount).toContainText('0.00');
    // Released Reserve U becomes 90.00
    await expect(reserveManager.locator('[data-testid="owner-total-reserve-released"]')).toContainText('90.00');
    // Payable Amount becomes 90.00!
    await expect(reserveManager.locator('[data-testid="owner-payable-after-release"]')).toContainText('90.00');

    // Button is now disabled because actual held reserve H = 0 (no reserve to release)
    await expect(submitReleaseBtn).toBeDisabled();

    // 6. Role isolation checks (AC-83)
    // Organizer tries to POST reserve release -> 403 Forbidden
    const orgReleaseRes = await page.request.post(`/api/owner/events/${createdEvent.id}/reserve-releases`, {
      data: { amount: 10 },
    });
    expect(orgReleaseRes.status()).toBe(403);

    // Scanner tries to POST reserve release -> 403 Forbidden
    const scannerContext = await browser.newContext();
    const scannerPage = await scannerContext.newPage();
    await scannerPage.goto('/login');
    await scannerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.scanner.email);
    await scannerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scannerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scannerPage).toHaveURL('/back-office/scanner');

    const scannerReleaseRes = await scannerPage.request.post(`/api/owner/events/${createdEvent.id}/reserve-releases`, {
      data: { amount: 10 },
    });
    expect(scannerReleaseRes.status()).toBe(403);
    await scannerContext.close();

    // Unauthenticated request -> 401 Unauthorized
    const unauthReleaseRes = await request.post(`/api/owner/events/${createdEvent.id}/reserve-releases`, {
      data: { amount: 10 },
    });
    expect(unauthReleaseRes.status()).toBe(401);

    await ownerContext.close();
  });
});
