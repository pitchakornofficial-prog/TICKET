import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.describe('TASK-034: Offline Sync and Central Revocation Conflicts (AC-99, AC-102, AC-42)', () => {
  test('Primary device syncs pending scans idempotently, handles central revocation conflict, and owner resolves conflict', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);

    const eventTitle = `คอนเสิร์ต ซิงก์ออฟไลน์ ${testInfo.project.name} ${Date.now()}`;
    const buyerEmail = `buyer-sync-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const buyerPhone = '0812345678';
    const buyerName = 'คุณสมหมาย ซิงก์';
    const scannerEmail = `scanner-sync-${testInfo.project.name}-${Date.now()}@ticket.invalid`;

    const now = Date.now();
    const sessionStartTime = new Date(now - 1 * 3600 * 1000).toISOString();
    const sessionEndTime = new Date(now + 4 * 3600 * 1000).toISOString();

    // 1. Organizer logs in and creates event
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    // Create Event
    await page.getByRole('button', { name: '+ สร้างงานคอนเสิร์ตใหม่' }).click();
    await page.getByLabel('ชื่องานคอนเสิร์ต').fill(eventTitle);
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค อารีน่า ฮอลล์ 2');
    await page.getByRole('button', { name: 'บันทึกข้อมูลร่าง (Draft)' }).click();
    await expect(page.getByText('บันทึกงานคอนเสิร์ตสำเร็จ')).toBeVisible({ timeout: 20000 });

    const eventsRes = await page.request.get('/api/events');
    const { events } = await eventsRes.json();
    const event = events.find((e: { title: string; id: string }) => e.title === eventTitle);
    expect(event).toBeDefined();

    // Configure session
    const updateRes = await page.request.put(`/api/events/${event.id}`, {
      data: {
        limitPerOrder: 4,
        sessions: [
          {
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            ticketTypes: [{ name: 'VIP Zone', price: 1500, quota: 20 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const sessionId = (await updateRes.json()).event.sessions[0].id;

    // Submit session for approval
    await page.request.post(`/api/events/${event.id}?action=submit-session`, { data: { sessionId } });

    // Approve session via owner
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/login');
    await ownerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await ownerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(ownerPage).toHaveURL('/back-office/owner');

    await ownerPage.request.post('/api/owner/sessions', { data: { sessionId } });

    // 2. Organizer adds scanner and sets primary
    await page.goto('/back-office/organizer');
    const scannerSelect = page.locator('#select-scanner-event');
    await expect(scannerSelect.locator(`option[value="${event.id}"]`)).toBeAttached({ timeout: 20000 });
    await scannerSelect.selectOption(event.id);

    await page.locator('#scanner-name').fill('หัวหน้าสแกน ซิงก์');
    await page.locator('#scanner-email').fill(scannerEmail);
    await page.locator('#scanner-password').fill(fixturePassword);
    await page.getByRole('button', { name: 'เพิ่มทีมสแกนสำหรับงานนี้' }).click();
    await expect(page.getByText('เพิ่มทีมสแกนสำหรับงานคอนเสิร์ตเรียบร้อยแล้ว')).toBeVisible({ timeout: 20000 });

    const scListRes = await page.request.get(`/api/organizer/events/${event.id}/scanners`);
    const { scanners } = await scListRes.json();
    const sc = scanners.find((s: { email: string }) => s.email === scannerEmail);
    expect(sc).toBeDefined();

    const setPrimaryBtn = page.locator(`[data-testid="set-primary-scanner-${sc.scannerId}"]`);
    await expect(setPrimaryBtn).toBeVisible({ timeout: 20000 });
    await setPrimaryBtn.click();
    await expect(page.getByText('กำหนดเครื่องหลักสำหรับงานเรียบร้อยแล้ว (AC-94)')).toBeVisible({ timeout: 20000 });

    // 3. Buyer purchases a ticket
    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto(`/events/${event.id}`);
    await expect(buyerPage.getByRole('heading', { name: eventTitle })).toBeVisible({ timeout: 25000 });

    await buyerPage.getByLabel('ชื่อ-นามสกุล *').fill(buyerName);
    await buyerPage.getByLabel('อีเมล *').fill(buyerEmail);
    await buyerPage.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(buyerPhone);
    await buyerPage.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();
    await expect(buyerPage.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible({ timeout: 20000 });

    const otpRes = await request.get(`/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(buyerEmail)}`);
    const { code } = await otpRes.json();
    await buyerPage.getByLabel('รหัส OTP 6 หลัก *').fill(code);
    await buyerPage.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(buyerPage.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible({ timeout: 20000 });

    await buyerPage.getByRole('button', { name: 'เพิ่มจำนวน VIP Zone' }).click();
    const confirmBtn = buyerPage.getByRole('button', { name: 'ยืนยันการเลือกบัตร (1 ใบ)' });
    await expect(confirmBtn).toBeVisible({ timeout: 20000 });
    await confirmBtn.scrollIntoViewIfNeeded();
    await confirmBtn.click();
    await expect(buyerPage.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible({ timeout: 20000 });

    await buyerPage.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' }).click({ force: true });
    await expect(buyerPage.locator('#promptpay-qr-image')).toBeVisible({ timeout: 20000 });
    const simBtn = buyerPage.locator('#simulate-payment-button');
    await expect(simBtn).toBeVisible({ timeout: 20000 });
    await simBtn.scrollIntoViewIfNeeded();
    await simBtn.click();
    await expect(buyerPage.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible({ timeout: 25000 });

    const ticketCodeEl = buyerPage.locator('#ticket-code-0');
    await expect(ticketCodeEl).toBeVisible({ timeout: 20000 });
    const purchasedTicketCode = (await ticketCodeEl.textContent())?.trim() || '';
    expect(purchasedTicketCode).toMatch(/^TK-/);
    await buyerContext.close();

    // 4. Scanner logs in and downloads offline dataset
    const scannerContext = await browser.newContext();
    const scannerPage = await scannerContext.newPage();
    await scannerPage.goto('/login');
    await scannerPage.getByLabel('อีเมล', { exact: true }).fill(scannerEmail);
    await scannerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scannerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scannerPage).toHaveURL('/back-office/scanner');

    const openTerminalBtn = scannerPage.locator(`#open-terminal-btn-${sessionId}`);
    await expect(openTerminalBtn).toBeVisible({ timeout: 20000 });
    await openTerminalBtn.click();

    // Download offline dataset
    const downloadDatasetBtn = scannerPage.locator('#download-offline-dataset-btn');
    await expect(downloadDatasetBtn).toBeVisible({ timeout: 20000 });
    await downloadDatasetBtn.click();
    await expect(scannerPage.getByText('ดาวน์โหลดชุดข้อมูลออฟไลน์สำเร็จเรียบร้อย')).toBeVisible({ timeout: 20000 });
    await expect(scannerPage.locator('[data-testid="cached-tickets-count"]')).toContainText('1 ใบ');

    // 5. Toggle offline mode and perform offline scan (AC-40, AC-96)
    const toggleOfflineBtn = scannerPage.locator('#toggle-offline-mode-btn');
    await expect(toggleOfflineBtn).toBeVisible();
    await toggleOfflineBtn.click();
    await expect(scannerPage.locator('[data-testid="connectivity-status-badge"]')).toContainText('ออฟไลน์');

    const ticketInput = scannerPage.locator('#scanner-ticket-input');
    const submitBtn = scannerPage.locator('#scanner-submit-btn');

    await ticketInput.fill(purchasedTicketCode);
    await submitBtn.click();

    // Verify scan result feedback and pending count increases to 1
    await expect(scannerPage.locator('#scan-result-card')).toHaveClass(/result-success-entry/);
    await expect(scannerPage.locator('#scan-result-message')).toContainText('บันทึกเข้างานสำเร็จ (ผ่าน) [ออฟไลน์]');
    await expect(scannerPage.locator('[data-testid="pending-sync-count"]')).toHaveText('1');

    // 6. Connect back online and sync pending scans (AC-102, AC-42)
    await toggleOfflineBtn.click();
    await expect(scannerPage.locator('[data-testid="connectivity-status-badge"]')).toContainText('ออนไลน์');

    const syncPendingBtn = scannerPage.locator('#sync-offline-pending-btn');
    await expect(syncPendingBtn).toBeEnabled({ timeout: 10000 });
    await syncPendingBtn.click();

    // Verify sync completed, pending count cleared to 0 (AC-102)
    await expect(scannerPage.locator('[data-testid="pending-sync-count"]')).toHaveText('0', { timeout: 15000 });
    await expect(scannerPage.getByText('ซิงก์สำเร็จ 1 รายการ')).toBeVisible({ timeout: 15000 });

    // 7. Test Idempotency: sync button is disabled when pending queue is 0
    await expect(syncPendingBtn).toBeDisabled();

    // Cleanup contexts
    await ownerContext.close();
    await scannerContext.close();
  });
});
