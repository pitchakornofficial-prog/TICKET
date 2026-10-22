import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.describe('Offline Primary Dataset & Privacy Protection (TASK-032, AC-94, AC-65, G-41)', () => {
  test('Organizer designates primary scanner; scanner downloads offline dataset with zero buyer PII', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    const eventTitle = `คอนเสิร์ต ออฟไลน์ไพรมารี ${testInfo.project.name} ${Date.now()}`;
    const buyerEmail = `buyer-dataset-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const buyerPhone = '0812345678';
    const buyerName = 'คุณสุชาติ ออฟไลน์';

    const scanner1Email = `scanner1-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const scanner2Email = `scanner2-${testInfo.project.name}-${Date.now()}@ticket.invalid`;

    const now = Date.now();
    const sessionStartTime = new Date(now + 240 * 3600 * 1000).toISOString();
    const sessionEndTime = new Date(now + 244 * 3600 * 1000).toISOString();

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
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค ชาเลนเจอร์ ฮอลล์');
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
            ticketTypes: [{ name: 'Regular Zone', price: 1000, quota: 20 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const sessionId = (await updateRes.json()).event.sessions[0].id;

    // Submit session
    await page.request.post(`/api/events/${event.id}?action=submit-session`, { data: { sessionId } });

    // 2. Owner logs in and approves session
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/login');
    await ownerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await ownerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(ownerPage).toHaveURL('/back-office/owner');

    await ownerPage.request.post('/api/owner/sessions', { data: { sessionId } });
    await ownerContext.close();

    // 3. Organizer adds Scanner 1 and Scanner 2
    await page.goto('/back-office/organizer');
    const scannerSelect = page.locator('#select-scanner-event');
    await expect(scannerSelect.locator(`option[value="${event.id}"]`)).toBeAttached({ timeout: 20000 });
    await scannerSelect.selectOption(event.id);

    // Add Scanner 1
    await page.locator('#scanner-name').fill('ทีมสแกน 1 (เครื่องหลัก)');
    await page.locator('#scanner-email').fill(scanner1Email);
    await page.locator('#scanner-password').fill(fixturePassword);
    await page.getByRole('button', { name: 'เพิ่มทีมสแกนสำหรับงานนี้' }).click();
    await expect(page.getByText('เพิ่มทีมสแกนสำหรับงานคอนเสิร์ตเรียบร้อยแล้ว')).toBeVisible({ timeout: 20000 });

    // Add Scanner 2
    await page.locator('#scanner-name').fill('ทีมสแกน 2 (เครื่องสำรอง)');
    await page.locator('#scanner-email').fill(scanner2Email);
    await page.locator('#scanner-password').fill(fixturePassword);
    await page.getByRole('button', { name: 'เพิ่มทีมสแกนสำหรับงานนี้' }).click();
    await expect(page.getByText('เพิ่มทีมสแกนสำหรับงานคอนเสิร์ตเรียบร้อยแล้ว')).toBeVisible({ timeout: 20000 });

    // Get scanners list to retrieve scanner IDs
    const scListRes = await page.request.get(`/api/organizer/events/${event.id}/scanners`);
    const { scanners } = await scListRes.json();
    const sc1 = scanners.find((s: { email: string }) => s.email === scanner1Email);
    const sc2 = scanners.find((s: { email: string }) => s.email === scanner2Email);
    expect(sc1).toBeDefined();
    expect(sc2).toBeDefined();

    // 4. Organizer designates Scanner 1 as primary device (AC-94)
    const setPrimaryBtn = page.locator(`[data-testid="set-primary-scanner-${sc1.scannerId}"]`);
    await expect(setPrimaryBtn).toBeVisible({ timeout: 20000 });
    await setPrimaryBtn.click();

    await expect(page.getByText('กำหนดเครื่องหลักสำหรับงานเรียบร้อยแล้ว (AC-94)')).toBeVisible({ timeout: 20000 });

    // Verify Scanner 1 has primary badge
    const badgeSc1 = page.locator(`[data-testid="primary-scanner-badge-${sc1.scannerId}"]`);
    await expect(badgeSc1).toBeVisible({ timeout: 20000 });
    await expect(badgeSc1).toContainText('เครื่องหลักประจำงาน (Primary — AC-94)');

    // Verify Scanner 2 does NOT have primary badge (still has set primary button)
    const setPrimaryBtn2 = page.locator(`[data-testid="set-primary-scanner-${sc2.scannerId}"]`);
    await expect(setPrimaryBtn2).toBeVisible();

    // 5. Buyer purchases 1 ticket in Event A (1,000 THB)
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

    await buyerPage.getByRole('button', { name: 'เพิ่มจำนวน Regular Zone' }).click();
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
    await buyerContext.close();

    // 6. Scanner 1 logs in and views their dashboard
    const scanner1Context = await browser.newContext();
    const scanner1Page = await scanner1Context.newPage();
    await scanner1Page.goto('/login');
    await scanner1Page.getByLabel('อีเมล', { exact: true }).fill(scanner1Email);
    await scanner1Page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scanner1Page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scanner1Page).toHaveURL('/back-office/scanner');

    // Scanner 1 sees primary badge on event card
    const eventPrimaryBadge = scanner1Page.locator(`[data-testid="event-primary-badge-${event.id}"]`);
    await expect(eventPrimaryBadge).toBeVisible({ timeout: 20000 });
    await expect(eventPrimaryBadge).toContainText('เครื่องหลักประจำงาน (Primary — AC-94)');

    // 7. Scanner 1 opens admission terminal
    const openTerminalBtn = scanner1Page.locator(`#open-terminal-btn-${sessionId}`);
    await expect(openTerminalBtn).toBeVisible({ timeout: 20000 });
    await openTerminalBtn.click();

    // Terminal header displays primary device badge
    const terminalPrimaryBadge = scanner1Page.locator('[data-testid="terminal-primary-badge"]');
    await expect(terminalPrimaryBadge).toBeVisible({ timeout: 20000 });
    await expect(terminalPrimaryBadge).toContainText('เครื่องหลักประจำงาน (Primary Device — AC-94)');

    // Offline dataset panel is visible
    const datasetPanel = scanner1Page.locator('[data-testid="offline-dataset-panel"]');
    await expect(datasetPanel).toBeVisible({ timeout: 20000 });

    // Download offline dataset button
    const downloadBtn = scanner1Page.locator('#download-offline-dataset-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 20000 });

    // Intercept network request to inspect offline dataset payload (CRITICAL AC-65 & AC-94 check)
    const [datasetResponse] = await Promise.all([
      scanner1Page.waitForResponse(resp => resp.url().includes(`/api/scanner/events/${event.id}/offline-dataset`)),
      downloadBtn.click(),
    ]);

    expect(datasetResponse.status()).toBe(200);
    const datasetJson = await datasetResponse.json();

    // Verify dataset integrity
    expect(datasetJson.event.id).toBe(event.id);
    expect(datasetJson.isCurrentScannerPrimary).toBe(true);
    expect(datasetJson.primaryScanner.scannerId).toBe(sc1.scannerId);
    expect(datasetJson.totalTickets).toBeGreaterThanOrEqual(1);
    expect(datasetJson.lastSuccessfulSync).toBeDefined();

    // CRITICAL (AC-65): Zero buyer PII in any ticket or log
    for (const t of datasetJson.tickets) {
      expect(t.buyerName).toBeUndefined();
      expect(t.buyerEmail).toBeUndefined();
      expect(t.buyerPhone).toBeUndefined();
      expect(t.customerFee).toBeUndefined();
      expect(t.paymentId).toBeUndefined();
      expect(t.chargeId).toBeUndefined();
      expect(t.ticketCode).toBeDefined();
      expect(t.status).toBe('valid');
      expect(t.admissionStatus).toBe('outside');
    }

    // UI feedback shows sync success
    await expect(scanner1Page.getByText('ดาวน์โหลดชุดข้อมูลออฟไลน์สำเร็จเรียบร้อย')).toBeVisible({ timeout: 20000 });
    await expect(scanner1Page.locator('[data-testid="offline-dataset-status-badge"]')).toContainText('พร้อมใช้งาน (1 ใบ)');
    await expect(scanner1Page.locator('[data-testid="cached-tickets-count"]')).toContainText('1 ใบ');
    await expect(scanner1Page.locator('[data-testid="last-successful-sync-time"]')).not.toBeEmpty();
    await expect(scanner1Page.locator('[data-testid="offline-privacy-guarantee"]')).toBeVisible();

    // Check localStorage in browser contains dataset with zero PII
    const localData = await scanner1Page.evaluate((evtId) => {
      const item = localStorage.getItem(`ticket_offline_dataset_${evtId}`);
      return item ? JSON.parse(item) : null;
    }, event.id);

    expect(localData).not.toBeNull();
    expect(localData.totalTickets).toBeGreaterThanOrEqual(1);
    expect(localData.tickets[0].buyerName).toBeUndefined();
    expect(localData.tickets[0].buyerEmail).toBeUndefined();
    expect(localData.tickets[0].buyerPhone).toBeUndefined();

    // 8. Scanner 2 logs in (secondary scanner)
    const scanner2Context = await browser.newContext();
    const scanner2Page = await scanner2Context.newPage();
    await scanner2Page.goto('/login');
    await scanner2Page.getByLabel('อีเมล', { exact: true }).fill(scanner2Email);
    await scanner2Page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scanner2Page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scanner2Page).toHaveURL('/back-office/scanner');

    // Scanner 2 sees secondary badge
    const eventSecondaryBadge = scanner2Page.locator(`[data-testid="event-secondary-badge-${event.id}"]`);
    await expect(eventSecondaryBadge).toBeVisible({ timeout: 20000 });
    await expect(eventSecondaryBadge).toContainText('เครื่องรอง (Secondary)');

    // Open terminal -> sees secondary badge in terminal
    const openTerminalBtn2 = scanner2Page.locator(`#open-terminal-btn-${sessionId}`);
    await expect(openTerminalBtn2).toBeVisible({ timeout: 20000 });
    await openTerminalBtn2.click();

    const terminalSecondaryBadge = scanner2Page.locator('[data-testid="terminal-secondary-badge"]');
    await expect(terminalSecondaryBadge).toBeVisible({ timeout: 20000 });
    await expect(terminalSecondaryBadge).toContainText('เครื่องรอง');

    // 9. Reassignment: Organizer switches primary to Scanner 2 (AC-94)
    await page.goto('/back-office/organizer');
    const scannerSelectAgain = page.locator('#select-scanner-event');
    await expect(scannerSelectAgain.locator(`option[value="${event.id}"]`)).toBeAttached({ timeout: 20000 });
    await scannerSelectAgain.selectOption(event.id);

    const setPrimaryBtn2Again = page.locator(`[data-testid="set-primary-scanner-${sc2.scannerId}"]`);
    await expect(setPrimaryBtn2Again).toBeVisible({ timeout: 20000 });
    await setPrimaryBtn2Again.click();

    await expect(page.getByText('กำหนดเครื่องหลักสำหรับงานเรียบร้อยแล้ว (AC-94)')).toBeVisible({ timeout: 20000 });

    // Now Scanner 2 has primary badge in organizer view
    const badgeSc2 = page.locator(`[data-testid="primary-scanner-badge-${sc2.scannerId}"]`);
    await expect(badgeSc2).toBeVisible({ timeout: 20000 });
    await expect(badgeSc2).toContainText('เครื่องหลักประจำงาน (Primary — AC-94)');

    // Scanner 2 reloads -> now primary!
    await scanner2Page.goto('/back-office/scanner');
    const eventPrimaryBadge2 = scanner2Page.locator(`[data-testid="event-primary-badge-${event.id}"]`);
    await expect(eventPrimaryBadge2).toBeVisible({ timeout: 20000 });
    await expect(eventPrimaryBadge2).toContainText('เครื่องหลักประจำงาน (Primary — AC-94)');

    // Scanner 1 reloads -> now secondary!
    await scanner1Page.goto('/back-office/scanner');
    const eventSecondaryBadge1 = scanner1Page.locator(`[data-testid="event-secondary-badge-${event.id}"]`);
    await expect(eventSecondaryBadge1).toBeVisible({ timeout: 20000 });
    await expect(eventSecondaryBadge1).toContainText('เครื่องรอง (Secondary)');

    // 10. Role isolation checks (AC-94, AC-08)
    // Scanner attempts to call POST /api/organizer/events/${event.id}/primary-scanner -> 403 Forbidden
    const scForbiddenRes = await scanner1Page.request.post(`/api/organizer/events/${event.id}/primary-scanner`, {
      data: { scannerId: sc1.scannerId },
    });
    expect(scForbiddenRes.status()).toBe(403);

    // Unauthenticated request to offline dataset -> 401 Unauthorized
    const unauthRes = await request.get(`/api/scanner/events/${event.id}/offline-dataset`);
    expect(unauthRes.status()).toBe(401);

    await scanner1Context.close();
    await scanner2Context.close();
  });
});
