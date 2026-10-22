import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.describe('TASK-033: Offline Admission Scanning on Primary Device (AC-40, AC-41, AC-50, AC-96, AC-103, AC-42)', () => {
  test('Primary device operates offline admission: full entry/exit/reentry sequence, reload resilience, pending queue, and secondary stoppage', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(120000);

    const eventTitle = `คอนเสิร์ต ออฟไลน์สแกน ${testInfo.project.name} ${Date.now()}`;
    const buyerEmail = `buyer-offline-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const buyerPhone = '0812345678';
    const buyerName = 'คุณสมชาย ออฟไลน์';

    const scanner1Email = `scanner1-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const scanner2Email = `scanner2-${testInfo.project.name}-${Date.now()}@ticket.invalid`;

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
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค อารีน่า ฮอลล์ 1');
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
            ticketTypes: [{ name: 'VIP Zone', price: 1200, quota: 20 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const sessionId = (await updateRes.json()).event.sessions[0].id;

    // Submit session
    await page.request.post(`/api/events/${event.id}?action=submit-session`, { data: { sessionId } });

    // 2. Owner approves session
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

    // 5. Buyer purchases 1 ticket in Event A
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

    // Extract ticket code from buyer page
    const ticketCodeEl = buyerPage.locator('#ticket-code-0');
    await expect(ticketCodeEl).toBeVisible({ timeout: 20000 });
    const purchasedTicketCode = (await ticketCodeEl.textContent())?.trim() || '';
    expect(purchasedTicketCode).toMatch(/^TK-/);
    await buyerContext.close();

    // 6. Secondary Scanner (Scanner 2) checks offline rejection (AC-40, O1)
    const scanner2Context = await browser.newContext();
    const scanner2Page = await scanner2Context.newPage();
    await scanner2Page.goto('/login');
    await scanner2Page.getByLabel('อีเมล', { exact: true }).fill(scanner2Email);
    await scanner2Page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scanner2Page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scanner2Page).toHaveURL('/back-office/scanner');

    const openTerminalBtn2 = scanner2Page.locator(`#open-terminal-btn-${sessionId}`);
    await expect(openTerminalBtn2).toBeVisible({ timeout: 20000 });
    await openTerminalBtn2.click();

    // Scanner 2 sees secondary badge
    await expect(scanner2Page.locator('[data-testid="terminal-secondary-badge"]')).toBeVisible();

    // Scanner 2 attempts to toggle offline mode -> rejected by operational rule (O1/AC-40)
    const toggleOfflineBtn2 = scanner2Page.locator('#toggle-offline-mode-btn');
    await expect(toggleOfflineBtn2).toBeVisible();
    await toggleOfflineBtn2.click();

    const nonPrimaryWarning = scanner2Page.locator('[data-testid="non-primary-offline-warning"]');
    await expect(nonPrimaryWarning).toBeVisible({ timeout: 10000 });
    await expect(nonPrimaryWarning).toContainText('เครื่องนี้เป็นเครื่องรองตาม O1 หากต้องการสแกนออฟไลน์ ต้องให้ผู้จัดงานกำหนดเป็นเครื่องหลักและหยุดเครื่องอื่นในงาน');
    // Connectivity badge remains online
    await expect(scanner2Page.locator('[data-testid="connectivity-status-badge"]')).toContainText('ออนไลน์');
    await scanner2Context.close();

    // 7. Primary Scanner (Scanner 1) operates offline
    const scanner1Context = await browser.newContext();
    const scanner1Page = await scanner1Context.newPage();
    await scanner1Page.goto('/login');
    await scanner1Page.getByLabel('อีเมล', { exact: true }).fill(scanner1Email);
    await scanner1Page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scanner1Page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scanner1Page).toHaveURL('/back-office/scanner');

    const openTerminalBtn1 = scanner1Page.locator(`#open-terminal-btn-${sessionId}`);
    await expect(openTerminalBtn1).toBeVisible({ timeout: 20000 });
    await openTerminalBtn1.click();

    // Download offline dataset
    const downloadBtn = scanner1Page.locator('#download-offline-dataset-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 20000 });
    await downloadBtn.click();
    await expect(scanner1Page.getByText('ดาวน์โหลดชุดข้อมูลออฟไลน์สำเร็จเรียบร้อย')).toBeVisible({ timeout: 20000 });
    await expect(scanner1Page.locator('[data-testid="cached-tickets-count"]')).toContainText('1 ใบ');
    await expect(scanner1Page.locator('[data-testid="pending-sync-count"]')).toContainText('0');

    // Switch to offline mode
    const toggleOfflineBtn1 = scanner1Page.locator('#toggle-offline-mode-btn');
    await toggleOfflineBtn1.click();

    // Connectivity badge shows offline (AC-42, AC-40)
    const connBadge = scanner1Page.locator('[data-testid="connectivity-status-badge"]');
    await expect(connBadge).toBeVisible();
    await expect(connBadge).toContainText('ออฟไลน์ (Offline Mode — AC-40)');
    await expect(scanner1Page.locator('[data-testid="connectivity-status-text"]')).toContainText('ออฟไลน์ (Offline Mode — AC-40)');

    // Operational notice for stopping other devices (O1/AC-40)
    const opNotice = scanner1Page.locator('[data-testid="primary-offline-operational-notice"]');
    await expect(opNotice).toBeVisible();
    await expect(opNotice).toContainText('เครื่องนี้ทำงานเป็นเครื่องหลักเพียงเครื่องเดียวของทั้งงาน กรุณาหยุดการใช้งานเครื่องสแกนอื่นทั้งหมด');

    // 8. Test Missing Ticket offline (AC-41, O2): must not pass and must inform user to wait for online
    const ticketInput = scanner1Page.locator('#scanner-ticket-input');
    const submitBtn = scanner1Page.locator('#scanner-submit-btn');

    await ticketInput.fill('TK-NONEXISTENT-999');
    await submitBtn.click();

    await expect(scanner1Page.locator('#scan-result-card')).toBeVisible({ timeout: 15000 });
    await expect(scanner1Page.locator('#scan-result-card')).toHaveClass(/result-rejected/);
    await expect(scanner1Page.locator('#scan-result-message')).toContainText('ไม่พบข้อมูลบัตรในชุดข้อมูลออฟไลน์ กรุณารอเชื่อมต่อออนไลน์ (AC-41, O2)');

    // 9. Offline State Transitions Sequence (AC-96, AC-50)
    // Step A: First Entry (outside -> inside)
    await ticketInput.fill(purchasedTicketCode);
    await submitBtn.click();

    await expect(scanner1Page.locator('#scan-result-card')).toHaveClass(/result-success-entry/);
    await expect(scanner1Page.locator('#scan-result-message')).toContainText('บันทึกเข้างานสำเร็จ (ผ่าน) [ออฟไลน์]');
    await expect(scanner1Page.locator('#scanned-ticket-code')).toHaveText(purchasedTicketCode);
    await expect(scanner1Page.locator('#scanned-ticket-admission-status')).toContainText('อยู่ในพื้นที่จัดงาน');
    // Pending sync count increases to 1 (AC-42, AC-103)
    await expect(scanner1Page.locator('[data-testid="pending-sync-count"]')).toHaveText('1');

    // Step B: Repeat Entry while inside (AC-96, AC-49)
    await ticketInput.fill(purchasedTicketCode);
    await submitBtn.click();

    await expect(scanner1Page.locator('#scan-result-card')).toHaveClass(/result-rejected/);
    await expect(scanner1Page.locator('#scan-result-message')).toContainText('บัตรอยู่ในพื้นที่จัดงานแล้ว ไม่อนุญาตให้เข้าซ้ำ (AC-49, AC-96)');
    await expect(scanner1Page.locator('[data-testid="pending-sync-count"]')).toHaveText('1');

    // Step C: Exit scan (inside -> outside) (AC-96)
    await scanner1Page.locator('#mode-exit-btn').click();
    await ticketInput.fill(purchasedTicketCode);
    await submitBtn.click();

    await expect(scanner1Page.locator('#scan-result-card')).toHaveClass(/result-success-exit/);
    await expect(scanner1Page.locator('#scan-result-message')).toContainText('บันทึกออกนอกงานสำเร็จ (ผ่าน) [ออฟไลน์]');
    await expect(scanner1Page.locator('#scanned-ticket-admission-status')).toContainText('อยู่นอกพื้นที่จัดงาน');
    await expect(scanner1Page.locator('[data-testid="pending-sync-count"]')).toHaveText('2');

    // Step D: Repeat Exit while outside (AC-96)
    await ticketInput.fill(purchasedTicketCode);
    await submitBtn.click();

    await expect(scanner1Page.locator('#scan-result-card')).toHaveClass(/result-rejected/);
    await expect(scanner1Page.locator('#scan-result-message')).toContainText('บัตรอยู่นอกพื้นที่จัดงาน ไม่สามารถบันทึกออกได้');
    await expect(scanner1Page.locator('[data-testid="pending-sync-count"]')).toHaveText('2');

    // Step E: Reentry scan (outside -> inside) (AC-96)
    await scanner1Page.locator('#mode-entry-btn').click();
    await ticketInput.fill(purchasedTicketCode);
    await submitBtn.click();

    await expect(scanner1Page.locator('#scan-result-card')).toHaveClass(/result-success-entry/);
    await expect(scanner1Page.locator('#scan-result-message')).toContainText('บันทึกเข้างานสำเร็จ (ผ่าน) [ออฟไลน์]');
    await expect(scanner1Page.locator('[data-testid="pending-sync-count"]')).toHaveText('3');

    // 10. Reload Resilience (AC-103): pending scans and admission states persist across reloads
    await scanner1Page.reload();
    await expect(scanner1Page.locator(`#open-terminal-btn-${sessionId}`)).toBeVisible({ timeout: 20000 });
    await scanner1Page.locator(`#open-terminal-btn-${sessionId}`).click();

    // Verify pending sync count remains 3 after reload!
    await expect(scanner1Page.locator('[data-testid="pending-sync-count"]')).toHaveText('3', { timeout: 15000 });

    // Switch to offline mode again
    await scanner1Page.locator('#toggle-offline-mode-btn').click();
    await expect(scanner1Page.locator('[data-testid="connectivity-status-badge"]')).toContainText('ออฟไลน์');

    // Try scanning entry again: should still be rejected as 'ALREADY_INSIDE' because ticket is inside!
    await ticketInput.fill(purchasedTicketCode);
    await submitBtn.click();
    await expect(scanner1Page.locator('#scan-result-card')).toHaveClass(/result-rejected/);
    await expect(scanner1Page.locator('#scan-result-message')).toContainText('บัตรอยู่ในพื้นที่จัดงานแล้ว ไม่อนุญาตให้เข้าซ้ำ (AC-49, AC-96)');

    // 11. Storage Write Failure Handling (AC-103)
    // Simulate quota exceeded or storage failure
    await scanner1Page.evaluate(() => {
      const orig = localStorage.setItem.bind(localStorage);
      (window as unknown as Record<string, unknown>).__origSetItem = orig;
      localStorage.setItem = () => {
        throw new Error('QuotaExceededError');
      };
    });

    // Attempt exit scan while storage write is broken
    await scanner1Page.locator('#mode-exit-btn').click();
    await ticketInput.fill(purchasedTicketCode);
    await submitBtn.click();

    await expect(scanner1Page.locator('#scan-result-card')).toHaveClass(/result-rejected/);
    await expect(scanner1Page.locator('#scan-result-message')).toContainText('เกิดข้อผิดพลาดในการบันทึกข้อมูลลงอุปกรณ์ (Storage Error) ไม่อนุญาตให้ผ่าน (AC-103)');

    // Restore localStorage.setItem
    await scanner1Page.evaluate(() => {
      const orig = (window as unknown as Record<string, unknown>).__origSetItem as (key: string, val: string) => void;
      if (orig) localStorage.setItem = orig;
    });

    await scanner1Context.close();
  });
});
