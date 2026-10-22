import { test, expect } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';

test.describe('TASK-035: Primary Handover and Emergency Recovery (AC-97, AC-98)', () => {
  test('Organizer checks handover readiness, handovers primary device when conditions are met, and triggers emergency stop for reconciliation', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120000);

    const eventTitle = `คอนเสิร์ต แฮนด์โอเวอร์ ${testInfo.project.name} ${Date.now()}`;
    const scanner1Email = `hnd-sc1-${testInfo.project.name}-${Date.now()}@ticket.invalid`;
    const scanner2Email = `hnd-sc2-${testInfo.project.name}-${Date.now()}@ticket.invalid`;

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
    await page.getByLabel('สถานที่จัดงาน').fill('อิมแพ็ค อารีน่า ฮอลล์ 3');
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
            ticketTypes: [{ name: 'Regular Zone', price: 1000, quota: 30 }],
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const sessionId = (await updateRes.json()).event.sessions[0].id;

    // Submit and approve session
    await page.request.post(`/api/events/${event.id}?action=submit-session`, { data: { sessionId } });

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/login');
    await ownerPage.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await ownerPage.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await ownerPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(ownerPage).toHaveURL('/back-office/owner');
    await ownerPage.request.post('/api/owner/sessions', { data: { sessionId } });
    await ownerContext.close();

    // 2. Organizer adds Scanner 1 and Scanner 2
    await page.goto('/back-office/organizer');
    const scannerSelect = page.locator('#select-scanner-event');
    await expect(scannerSelect.locator(`option[value="${event.id}"]`)).toBeAttached({ timeout: 20000 });
    await scannerSelect.selectOption(event.id);

    // Add Scanner 1
    await page.locator('#scanner-name').fill('ทีมสแกน 1 (เครื่องเดิม)');
    await page.locator('#scanner-email').fill(scanner1Email);
    await page.locator('#scanner-password').fill(fixturePassword);
    await page.getByRole('button', { name: 'เพิ่มทีมสแกนสำหรับงานนี้' }).click();
    await expect(page.getByText('เพิ่มทีมสแกนสำหรับงานคอนเสิร์ตเรียบร้อยแล้ว')).toBeVisible({ timeout: 20000 });

    // Add Scanner 2
    await page.locator('#scanner-name').fill('ทีมสแกน 2 (เครื่องใหม่)');
    await page.locator('#scanner-email').fill(scanner2Email);
    await page.locator('#scanner-password').fill(fixturePassword);
    await page.getByRole('button', { name: 'เพิ่มทีมสแกนสำหรับงานนี้' }).click();
    await expect(page.getByText('เพิ่มทีมสแกนสำหรับงานคอนเสิร์ตเรียบร้อยแล้ว')).toBeVisible({ timeout: 20000 });

    // Retrieve scanners list
    const scListRes = await page.request.get(`/api/organizer/events/${event.id}/scanners`);
    const { scanners } = await scListRes.json();
    const sc1 = scanners.find((s: { email: string }) => s.email === scanner1Email);
    const sc2 = scanners.find((s: { email: string }) => s.email === scanner2Email);
    expect(sc1).toBeDefined();
    expect(sc2).toBeDefined();

    // 3. Designate Scanner 1 as initial primary
    const setPrimaryBtn1 = page.locator(`[data-testid="set-primary-scanner-${sc1.scannerId}"]`);
    await expect(setPrimaryBtn1).toBeVisible({ timeout: 20000 });
    await setPrimaryBtn1.click();
    await expect(page.getByText('กำหนดเครื่องหลักสำหรับงานเรียบร้อยแล้ว (AC-94)')).toBeVisible({ timeout: 20000 });

    // 4. Test Handover Rejection: Attempt to handover to Scanner 2 before it downloads dataset (AC-97)
    const handoverBtn = page.locator(`[data-testid="handover-primary-scanner-${sc2.scannerId}"]`);
    await expect(handoverBtn).toBeVisible({ timeout: 15000 });
    await handoverBtn.click();

    // Check readiness inside modal
    const checkReadinessBtn = page.locator('#check-handover-readiness-btn');
    await expect(checkReadinessBtn).toBeVisible();
    await checkReadinessBtn.click();
    await expect(page.getByText('เครื่องใหม่ยังไม่ได้ดาวน์โหลดชุดข้อมูลล่าสุด')).toBeVisible({ timeout: 10000 });

    // Close modal
    await page.locator('#cancel-handover-modal-btn').click();

    // 5. Scanner 2 logs in and downloads offline dataset
    const scanner2Context = await browser.newContext();
    const scanner2Page = await scanner2Context.newPage();
    await scanner2Page.goto('/login');
    await scanner2Page.getByLabel('อีเมล', { exact: true }).fill(scanner2Email);
    await scanner2Page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await scanner2Page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(scanner2Page).toHaveURL('/back-office/scanner');

    const openTerminalBtn = scanner2Page.locator(`#open-terminal-btn-${sessionId}`);
    await expect(openTerminalBtn).toBeVisible({ timeout: 20000 });
    await openTerminalBtn.click();

    const downloadBtn = scanner2Page.locator('#download-offline-dataset-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 20000 });
    await downloadBtn.click();
    await expect(scanner2Page.getByText('ดาวน์โหลดชุดข้อมูลออฟไลน์สำเร็จเรียบร้อย')).toBeVisible({ timeout: 20000 });
    await scanner2Context.close();

    // 6. Organizer performs handover to Scanner 2 (AC-97)
    await page.bringToFront();
    await handoverBtn.click();
    await page.locator('#declared-old-pending').fill('0');
    await checkReadinessBtn.click();
    await expect(page.getByText('ผ่านเกณฑ์การตรวจสอบความพร้อม พร้อมสลับเครื่องหลัก (AC-97)')).toBeVisible({ timeout: 10000 });

    const confirmHandoverBtn = page.locator('#confirm-handover-btn');
    await expect(confirmHandoverBtn).toBeVisible();
    await confirmHandoverBtn.click();

    await expect(page.getByText('สลับเครื่องหลักประจำงานสำเร็จ (AC-97)')).toBeVisible({ timeout: 15000 });
    // Verify Scanner 2 now has the primary badge
    await expect(page.locator(`[data-testid="primary-scanner-badge-${sc2.scannerId}"]`)).toBeVisible();

    // 7. Emergency Stop Scenario (AC-98, NQ-06)
    const emergencyStopBtn = page.locator('#emergency-stop-offline-btn');
    await expect(emergencyStopBtn).toBeVisible();
    await emergencyStopBtn.click();

    const confirmEmergencyBtn = page.locator('#confirm-emergency-stop-btn');
    await expect(confirmEmergencyBtn).toBeVisible();
    await confirmEmergencyBtn.click();

    // Halted banner displayed with reconciliation notice
    await expect(page.locator('[data-testid="offline-halted-banner"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('การใช้งานโหมดออฟไลน์ถูกระงับเพื่อกระทบยอด (AC-98, NQ-06)')).toBeVisible();

    // Resume after reconciliation
    const resumeBtn = page.locator('#resume-offline-btn');
    await expect(resumeBtn).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await resumeBtn.click();

    await expect(page.getByText('กระทบยอดเสร็จสิ้น ปลดระงับและเปิดให้ตั้งเครื่องหลักใหม่เรียบร้อยแล้ว (AC-98)')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="offline-halted-banner"]')).not.toBeVisible();
  });
});
