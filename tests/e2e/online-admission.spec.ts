import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.describe('Online Admission Scanning Journey (TASK-020, AC-08, AC-39, AC-49, AC-95, AC-100, AC-101, AC-65)', () => {
  test('scanner logs in, opens terminal, scans entry, repeat entry rejected, scans exit, scans reentry, checks stats and logs without buyer PII', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120000);

    const eventTitle = `คอนเสิร์ต ตรวจบัตรออนไลน์ ${testInfo.project.name}`;
    const scannerEmail = `scanner-adm-${testInfo.project.name}@ticket.invalid`;
    const scannerName = `ทีมตรวจบัตร ${testInfo.project.name}`;
    const scannerPassword = `ScannerPass!${testInfo.project.name}2026`;
    const buyerEmail = `buyer-adm-${testInfo.project.name}@ticket.invalid`;
    const buyerPhone = '0812345678';
    const buyerName = `คุณสมชาย ผู้ชม ${testInfo.project.name}`;

    const now = new Date();
    const sessionStart = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const sessionEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();

    // 1. Organizer logs in, creates event and session
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    // Create event via API with session
    const createEventRes = await page.request.post('/api/events', {
      data: {
        title: eventTitle,
        description: 'คอนเสิร์ตทดสอบระบบสแกนเข้างานแบบออนไลน์',
        location: 'อิมแพ็ค อารีน่า เมืองทองธานี',
        sessions: [
          {
            startTime: sessionStart,
            endTime: sessionEnd,
            ticketTypes: [{ name: 'บัตรนั่ง VIP', price: 2500, quota: 20 }],
          },
        ],
      },
    });
    expect(createEventRes.status()).toBe(201);
    const createdEvent = (await createEventRes.json()).event;
    const sessionId = createdEvent.sessions[0].id;

    // Submit session for owner approval
    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    // Add scanner to event
    const addScannerRes = await page.request.post(`/api/organizer/events/${createdEvent.id}/scanners`, {
      data: {
        name: scannerName,
        email: scannerEmail,
        password: scannerPassword,
      },
    });
    expect(addScannerRes.status()).toBe(201);

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 2. Owner logs in and approves session
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติรอบนี้' }).click({ force: true });
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click({ force: true });
    await expect(page).toHaveURL('/login');

    // 3. Guest buyer visits concert detail page and completes purchase
    await page.goto(`/events/${createdEvent.id}`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();

    await page.getByLabel('ชื่อ-นามสกุล *').fill(buyerName);
    await page.getByLabel('อีเมล *').fill(buyerEmail);
    await page.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(buyerPhone);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อซื้อบัตร' }).click();

    await expect(page.getByText('ส่งรหัส OTP 6 หลักไปยังอีเมลของคุณเรียบร้อยแล้ว')).toBeVisible();

    const otpInspectRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(buyerEmail)}`,
    );
    expect(otpInspectRes.status()).toBe(200);
    const otpCode = (await otpInspectRes.json()).code;

    await page.getByLabel('รหัส OTP 6 หลัก *').fill(otpCode);
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();
    await expect(page.getByRole('heading', { name: 'ยืนยันอีเมลสำเร็จ (Guest Verified)' })).toBeVisible();

    // Select 1 ticket and reserve
    const addBtn = page.getByRole('button', { name: 'เพิ่มจำนวน บัตรนั่ง VIP' });
    await addBtn.click();
    await page.getByRole('button', { name: 'ยืนยันการเลือกบัตร (1 ใบ)' }).click();

    await expect(page.getByText('กันบัตรสำเร็จ (Reserved)')).toBeVisible();

    // Create PromptPay QR
    const generateQrBtn = page.getByRole('button', { name: 'สร้าง QR Code ชำระเงิน (PromptPay)' });
    await expect(generateQrBtn).toBeVisible();
    await generateQrBtn.click();
    await expect(page.locator('#promptpay-qr-image')).toBeVisible();

    // Simulate payment
    const simulateBtn = page.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.click();

    await expect(page.getByText('ชำระเงินสำเร็จ (Paid)')).toBeVisible();
    await expect(page.getByText('ออกบัตรสำเร็จแล้ว (1 ใบ)')).toBeVisible();

    const ticketCodeText = (await page.locator('#ticket-code-0').innerText()).trim();
    expect(ticketCodeText).toMatch(/^TK-/);

    // 4. Scanner logs in and opens admission terminal (AC-08, AC-09)
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(scannerEmail);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(scannerPassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/scanner');

    await expect(page.getByRole('heading', { name: 'งานคอนเสิร์ตที่ได้รับมอบหมาย' })).toBeVisible();
    await expect(page.getByText(eventTitle)).toBeVisible();

    // Open terminal for this session
    const openTerminalBtn = page.locator(`#open-terminal-btn-${sessionId}`);
    await expect(openTerminalBtn).toBeVisible();
    await openTerminalBtn.click({ force: true });

    await expect(page.locator('#admission-terminal-container')).toBeVisible();
    await expect(page.getByRole('heading', { name: `เครื่องตรวจบัตรเข้างาน: ${eventTitle}` })).toBeVisible();

    // 5. STEP A: Online entry scan (AC-49, AC-39)
    await page.locator('#scanner-ticket-input').fill(ticketCodeText);
    await page.locator('#scanner-submit-btn').click({ force: true });

    // Assert success banner and text+icon
    const resultCard = page.locator('#scan-result-card');
    await expect(resultCard).toBeVisible();
    await expect(resultCard).toHaveClass(/result-success-entry/);
    await expect(page.locator('#scan-result-message')).toHaveText('บันทึกเข้างานสำเร็จ (ผ่าน)');
    await expect(page.locator('#scanned-ticket-code')).toHaveText(ticketCodeText);
    await expect(page.locator('#scanned-ticket-admission-status')).toHaveText('อยู่ในพื้นที่จัดงาน');

    // Assert AC-65: Result card does NOT contain buyer PII
    const resultText = await resultCard.innerText();
    expect(resultText).not.toContain(buyerName);
    expect(resultText).not.toContain(buyerEmail);
    expect(resultText).not.toContain(buyerPhone);

    // Verify stats updated: currently inside = 1
    await expect(page.locator('#stats-currently-inside')).toHaveText('1');
    await expect(page.locator('#stats-total-entries')).toHaveText('1');

    // 6. STEP B: Repeat entry scan (AC-49, AC-08)
    await page.locator('#scanner-ticket-input').fill(ticketCodeText);
    await page.locator('#scanner-submit-btn').click({ force: true });

    await expect(resultCard).toHaveClass(/result-rejected/);
    await expect(page.locator('#scan-result-message')).toContainText('บัตรอยู่ในพื้นที่จัดงานแล้ว');

    // 7. STEP C: Exit scan (AC-39)
    const exitModeBtn = page.locator('#mode-exit-btn');
    await exitModeBtn.scrollIntoViewIfNeeded();
    await exitModeBtn.click();
    await expect(exitModeBtn).toHaveClass(/active/);

    await page.locator('#scanner-ticket-input').fill(ticketCodeText);
    await page.locator('#scanner-submit-btn').click({ force: true });

    await expect(resultCard).toHaveClass(/result-success-exit/);
    await expect(page.locator('#scan-result-message')).toContainText('บันทึกออกนอกงานสำเร็จ');
    await expect(page.locator('#scanned-ticket-admission-status')).toHaveText('อยู่นอกพื้นที่จัดงาน');

    // Stats: currently inside = 0, total exits = 1
    await expect(page.locator('#stats-currently-inside')).toHaveText('0');
    await expect(page.locator('#stats-total-exits')).toHaveText('1');

    // 8. STEP D: Re-entry scan (AC-95)
    const entryModeBtn = page.locator('#mode-entry-btn');
    await entryModeBtn.scrollIntoViewIfNeeded();
    await entryModeBtn.click();
    await expect(entryModeBtn).toHaveClass(/active/);

    await page.locator('#scanner-ticket-input').fill(ticketCodeText);
    await page.locator('#scanner-submit-btn').click({ force: true });

    await expect(resultCard).toHaveClass(/result-success-entry/);
    await expect(page.locator('#scan-result-message')).toHaveText('บันทึกเข้างานสำเร็จ (ผ่าน)');
    await expect(page.locator('#scanned-ticket-admission-status')).toHaveText('อยู่ในพื้นที่จัดงาน');

    // Stats: currently inside = 1, total entries = 2
    await expect(page.locator('#stats-currently-inside')).toHaveText('1');
    await expect(page.locator('#stats-total-entries')).toHaveText('2');

    // 9. Verify recent activity log table (AC-65: no buyer PII)
    const logsTable = page.locator('#admission-logs-table');
    await expect(logsTable).toBeVisible();
    await expect(logsTable.locator('tbody tr')).toHaveCount(4); // entry, repeat entry rejected, exit, reentry
    const logsText = await logsTable.innerText();
    expect(logsText).not.toContain(buyerName);
    expect(logsText).not.toContain(buyerEmail);
    expect(logsText).not.toContain(buyerPhone);

    // 10. Design constraints: Zero emojis (D-14) and responsive layout
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
