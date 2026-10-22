import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

let nextIp = 1;
test.beforeEach(async ({ context }, testInfo) => {
  const base = testInfo.project.name === 'desktop-chromium' ? 180 : 230;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${base + (nextIp++ % 40)}` });
});

test.describe('Weekly manual payout: calculation, recording, history, and private proof boundary (TASK-029, AC-27, AC-30, AC-31, AC-79, AC-87, AC-92, AC-93)', () => {
  test('owner records manual payout from payable amount; payable updates to 0 and paid increases; private proof isolation', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    const eventTitle = `คอนเสิร์ต รอบจ่ายเงิน ${testInfo.project.name} ${Date.now()}`;
    const buyerEmail = `buyer-payout-${testInfo.project.name}@ticket.invalid`;
    const buyerPhone = '0898765432';
    const buyerName = 'คุณสมเกียรติ พร้อมจ่าย';

    const sessionStartTime = new Date(Date.now() + 200 * 3600 * 1000).toISOString();
    const sessionEndTime = new Date(Date.now() + 204 * 3600 * 1000).toISOString();

    // 1. Organizer logs in and creates event
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

    // Configure session: 1000 THB ticket
    const updateRes = await page.request.put(`/api/events/${createdEvent.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            ticketTypes: [{ name: 'VIP Zone A', price: 1000, quota: 10 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    const sessionId = updatedData.event.sessions[0].id;

    // Submit session for owner approval
    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    // 2. Owner approves session and sets fee settings (5% organizer fee, 10% reserve)
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/login');
    await ownerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await ownerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(ownerPage).toHaveURL('/back-office/owner');

    const sessionCard = ownerPage.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click({ force: true });
    await expect(ownerPage.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    const feeConfigRes = await ownerPage.request.put(`/api/owner/events/${createdEvent.id}/fee-settings`, {
      data: {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 5,
        customerFeeMode: 'per_ticket',
        customerFeeRate: 20,
        reservePercentage: 10,
      },
    });
    expect(feeConfigRes.status()).toBe(200);

    // 3. Buyer purchases 2 tickets (2,000 THB tickets subtotal)
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

    // Select 2 tickets
    const addBtn = buyerPage.getByRole('button', { name: 'เพิ่มจำนวน VIP Zone A' });
    await addBtn.click();
    await addBtn.click();
    await buyerPage.getByRole('button', { name: 'ยืนยันการเลือกบัตร (2 ใบ)' }).click();
    await expect(buyerPage.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    // Generate PromptPay QR
    const generateQrBtn = buyerPage.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' });
    await expect(generateQrBtn).toBeVisible();
    await generateQrBtn.click();

    await expect(buyerPage.locator('#promptpay-qr-image')).toBeVisible();
    const simulateBtn = buyerPage.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.click();

    await expect(buyerPage.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await buyerContext.close();

    // 4. Organizer checks initial money report: Payable = 1,710 THB, Paid = 0
    await page.goto('/back-office/organizer');
    const openReportBtn = page.locator(`[data-testid="open-money-report-btn-${createdEvent.id}"]`);
    await expect(openReportBtn).toBeVisible();
    await openReportBtn.click({ force: true });

    const reportModal = page.locator('#organizer-money-report-modal');
    await expect(reportModal).toBeVisible();
    await expect(page.locator('[data-testid="payable-amount"]')).toContainText('1,710.00');
    await expect(page.locator('[data-testid="total-paid-out-amount"]')).toContainText('0.00');
    await expect(page.locator('[data-testid="empty-payouts-message"]')).toBeVisible();

    // Close organizer modal
    await page.getByRole('button', { name: 'ปิดรายงาน' }).click();

    // 5. Owner navigates to payout manager on /back-office/owner (AC-27, AC-30, AC-79)
    await ownerPage.goto('/back-office/owner');
    const payoutManager = ownerPage.locator('[data-testid="owner-weekly-payout-manager"]');
    await expect(payoutManager).toBeVisible();

    // Select this event in dropdown
    const select = payoutManager.locator('#payout-event-select');
    await select.selectOption(createdEvent.id);

    // Verify payable amount in owner dashboard: 1,710.00
    await expect(payoutManager.locator('[data-testid="owner-payable-amount"]')).toContainText('1,710.00');

    // Fill payout details
    await payoutManager.locator('#payout-note-input').fill('โอนรอบสัปดาห์ที่ 1');
    const submitBtn = payoutManager.locator('[data-testid="submit-payout-btn"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click({ force: true });

    // Feedback success message appears
    await expect(ownerPage.locator('#payout-feedback-success')).toBeVisible();
    await expect(ownerPage.getByText('บันทึกการโอนเงินสำเร็จ')).toBeVisible();

    // Payable is now 0.00 and submit is disabled
    await expect(payoutManager.locator('[data-testid="owner-payable-amount"]')).toContainText('0.00');
    await expect(submitBtn).toBeDisabled();

    // Verify payout history table shows the completed payout row
    const historyTable = ownerPage.locator('#payout-history-table');
    await expect(historyTable).toBeVisible();
    await expect(historyTable.getByText('โอนรอบสัปดาห์ที่ 1')).toBeVisible();
    await expect(historyTable.getByText('โอนสำเร็จ')).toBeVisible();

    // Retrieve the payout record ID from owner API
    const ownerReportRes = await ownerPage.request.get(`/api/owner/events/${createdEvent.id}/money-report`);
    const { report: ownerReport } = await ownerReportRes.json();
    expect(ownerReport.payouts.length).toBe(1);
    const payoutId = ownerReport.payouts[0].id;
    expect(ownerReport.totalPaidOut).toBe(1710);
    expect(ownerReport.payableAmount).toBe(0);

    // 6. Organizer views updated money report (AC-30, AC-31, AC-92)
    await page.reload();
    const openReportBtn2 = page.locator(`[data-testid="open-money-report-btn-${createdEvent.id}"]`);
    await expect(openReportBtn2).toBeVisible();
    await openReportBtn2.click({ force: true });

    await expect(page.locator('#organizer-money-report-modal')).toBeVisible();
    await expect(page.locator('[data-testid="payable-amount"]')).toContainText('0.00');
    await expect(page.locator('[data-testid="total-paid-out-amount"]')).toContainText('1,710.00');

    // Payout row appears in organizer history table
    const organizerPayoutRow = page.locator(`[data-testid="payout-row-${payoutId}"]`);
    await expect(organizerPayoutRow).toBeVisible();
    await expect(organizerPayoutRow.getByText('โอนรอบสัปดาห์ที่ 1')).toBeVisible();
    await expect(organizerPayoutRow.getByText('โอนสำเร็จ')).toBeVisible();

    // AC-92: Organizer has NO proof download link in UI
    await expect(page.locator(`[data-testid="payout-proof-link-${payoutId}"]`)).not.toBeVisible();

    // 7. Role-based proof download boundary (AC-92)
    // Organizer attempts to fetch proof endpoint directly -> 403 Forbidden
    const orgProofRes = await page.request.get(`/api/owner/payouts/${payoutId}/proof`);
    expect(orgProofRes.status()).toBe(403);

    // Scanner attempts to fetch proof endpoint directly -> 403 Forbidden
    const scannerContext = await browser.newContext();
    const scannerPage = await scannerContext.newPage();
    await scannerPage.goto('/login');
    await scannerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.scanner.email);
    await scannerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scannerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scannerPage).toHaveURL('/back-office/scanner');

    const scannerProofRes = await scannerPage.request.get(`/api/owner/payouts/${payoutId}/proof`);
    expect(scannerProofRes.status()).toBe(403);
    await scannerContext.close();

    // Unauthenticated request -> 401 Unauthorized
    const unauthProofRes = await request.get(`/api/owner/payouts/${payoutId}/proof`);
    expect(unauthProofRes.status()).toBe(401);

    await ownerContext.close();
  });
});
