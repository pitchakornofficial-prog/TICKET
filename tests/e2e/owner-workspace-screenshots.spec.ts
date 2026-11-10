import { testClientIp } from '../support/client-context';
import { expect, test } from '@playwright/test';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';


test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test('captures full screenshots of all owner workspace sections', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const isMobile = testInfo.project.name.includes('mobile');
  const suffix = isMobile ? '-mobile.png' : '-desktop.png';

  await page.goto('/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/back-office/);
  await page.goto('/back-office/owner');
  await expect(page.getByRole('heading', { name: 'พื้นที่เจ้าของเว็บ', exact: true })).toBeVisible();

  // 0. Mobile Navigation Dropdown Open (D-248)
  if (isMobile) {
    const mobileToggle = page.locator('[data-testid="owner-mobile-menu-toggle"]');
    if (await mobileToggle.isVisible()) {
      await mobileToggle.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: testInfo.outputPath('owner-00-mobile-nav-open.png') });
      await mobileToggle.click();
      await page.waitForTimeout(300);
    }
  }

  // 1. Overview
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath(`owner-01-overview${suffix}`), fullPage: true });

  // 2. Approval section (Concert Hub Tab 1: Pending)
  await page.goto('/back-office/owner#approval');
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath(`owner-02-approval${suffix}`), fullPage: true });

  // 2-modal. Review Modal (D-237)
  const inspectBtn = page.getByRole('button', { name: /ตรวจสอบรายละเอียดและอนุมัติ/ }).first();
  if (await inspectBtn.isVisible()) {
    await inspectBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: testInfo.outputPath(`owner-02-approval-modal${suffix}`), fullPage: true });
    const closeBtn = page.locator('.review-modal-close');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(400);
    }
  }

  // 2b. Approval section (Underline Tabs: Approved / Other - D-244, D-245)
  const approvedTab = page.getByRole('tab', { name: /อนุมัติแล้ว/ });
  if (await approvedTab.isVisible()) {
    await approvedTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-02-approved-live${suffix}`), fullPage: true });
  }

  const rejectedTab = page.getByRole('tab', { name: /อื่น ๆ/ });
  if (await rejectedTab.isVisible()) {
    await rejectedTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-02-revisions${suffix}`), fullPage: true });
  }

  const pendingTab = page.getByRole('tab', { name: /รออนุมัติ/ });
  if (await pendingTab.isVisible()) {
    await pendingTab.click();
    await page.waitForTimeout(300);
  }

  // 2d. Dedicated Refunds Tab (D-232, D-247)
  await page.goto('/back-office/owner#refunds');
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath(`owner-02-refunds${suffix}`), fullPage: true });

  const refundApprovedTab = page.getByRole('tab', { name: /รอโอนเงินคืน/ });
  if (await refundApprovedTab.isVisible()) {
    await refundApprovedTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-02-refunds-approved${suffix}`), fullPage: true });
  }

  const refundCompletedTab = page.getByRole('tab', { name: /โอนสำเร็จแล้ว/ });
  if (await refundCompletedTab.isVisible()) {
    await refundCompletedTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-02-refunds-completed${suffix}`), fullPage: true });
  }

  // 3. Finance section (D-252)
  await page.goto('/back-office/owner#finance');
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath(`owner-03-finance${suffix}`), fullPage: true });

  // 3.1 Review & Record Transfer Modal
  const recordPayoutBtn = page.locator('[data-testid^="record-payout-btn-"]').first();
  if (await recordPayoutBtn.isVisible()) {
    await recordPayoutBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-03-finance-transfer-modal${suffix}`) });

    // Close transfer modal
    const closeBtn = page.locator('.modal-close-icon-btn').first();
    if (await closeBtn.isVisible()) await closeBtn.click({ force: true });
    await page.waitForTimeout(300);
  }

  // 3.2 Payout History Tab & Bank Slip Proof Modal
  const historyTab = page.locator('.hub-filter-tab', { hasText: 'ประวัติการโอนเงินสำเร็จ' }).first();
  if (await historyTab.isVisible()) {
    await historyTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-03-finance-history${suffix}`), fullPage: true });

    // Open proof slip modal
    const proofLinkBtn = page.locator('[data-testid^="payout-proof-link-"]').first();
    if (await proofLinkBtn.isVisible()) {
      await proofLinkBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: testInfo.outputPath(`owner-03-finance-proof-modal${suffix}`) });

      const proofCloseBtn = page.locator('.modal-close-icon-btn').first();
      if (await proofCloseBtn.isVisible()) await proofCloseBtn.click({ force: true });
      await page.waitForTimeout(300);
    }
  }

  // 4. Customer section (D-250, D-251)
  await page.goto('/back-office/owner#customer');
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath(`owner-04-customer${suffix}`), fullPage: true });

  // 4.1 Edit contact modal popup & Top-Center Floating Toast (D-250, D-251)
  const editBtn = page.locator('[data-testid^="edit-contact-btn-"]').first();
  if (await editBtn.isVisible()) {
    await editBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-04-customer-edit-modal${suffix}`) });

    // Trigger toast notification
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: {
            type: 'success',
            message: 'แก้ไขข้อมูลติดต่อคำสั่งซื้อ #ORD-20261105-0891 สำเร็จเรียบร้อย (บันทึกประวัติรหัส AUD-20261106-092)',
          },
        }),
      );
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath(`owner-04-customer-toast${suffix}`) });

    const toastCloseBtn = page.locator('.toast-close-btn').first();
    if (await toastCloseBtn.isVisible()) await toastCloseBtn.click();
    await page.waitForTimeout(200);

    const closeBtn = page.locator('.modal-close-icon-btn').first();
    if (await closeBtn.isVisible()) await closeBtn.click({ force: true });
    await page.waitForTimeout(300);
  }

  // 4.5. Invitations & Users section (D-254)
  await page.goto('/back-office/owner#invitations');
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath(`owner-05-invitations${suffix}`), fullPage: true });

  // Open Create Invite Modal
  const openInviteBtn = page.locator('[data-testid="open-invite-modal-btn"]');
  if (await openInviteBtn.isVisible()) {
    await openInviteBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-05-invitations-modal${suffix}`) });

    const closeInviteModalBtn = page.locator('.modal-close-icon-btn').first();
    if (await closeInviteModalBtn.isVisible()) await closeInviteModalBtn.click({ force: true });
    await page.waitForTimeout(300);
  }

  // Switch to Organizers Tab
  const orgTab = page.locator('[data-testid="tab-organizers"]');
  if (await orgTab.isVisible()) {
    await orgTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-05-invitations-organizers${suffix}`), fullPage: true });
  }

  // 5. System & News section (D-255)
  await page.goto('/back-office/owner#system');
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath(`owner-05-system${suffix}`), fullPage: true });

  // 5.1 Open Create News Modal Dialog
  const openCreateNewsBtn = page.locator('[data-testid="open-create-news-modal-btn"]');
  if (await openCreateNewsBtn.isVisible()) {
    await openCreateNewsBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-05-system-create-news-modal${suffix}`) });

    const closeCreateNewsModalBtn = page.locator('.modal-close-icon-btn').first();
    if (await closeCreateNewsModalBtn.isVisible()) await closeCreateNewsModalBtn.click({ force: true });
    await page.waitForTimeout(300);
  }

  // 5.2 Open Organizer News Review & Approval Modal Dialog
  const reviewNewsBtn = page.locator('[data-testid^="review-news-btn-"]').first();
  if (await reviewNewsBtn.isVisible()) {
    await reviewNewsBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-05-system-review-news-modal${suffix}`) });

    const closeReviewModalBtn = page.locator('.modal-close-icon-btn').first();
    if (await closeReviewModalBtn.isVisible()) await closeReviewModalBtn.click({ force: true });
    await page.waitForTimeout(300);
  }

  // 5.3 Switch to Admin Contact Channels Tab with Live Preview Card
  const contactsTab = page.locator('[data-testid="tab-contacts"]');
  if (await contactsTab.isVisible()) {
    await contactsTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`owner-05-system-contacts-preview${suffix}`), fullPage: true });
  }

  // 6. Sticky Top Navigation verification while scrolled (D-249)
  await page.goto('/back-office/owner#approval');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 450));
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath(`owner-sticky-scrolled${suffix}`) });

  // 7. Organizer Sticky Top Navigation (D-249)
  const signOutBtn = page.getByRole('button', { name: 'ออกจากระบบ' });
  if (await signOutBtn.isVisible()) {
    await signOutBtn.click();
    await page.waitForURL(/\/login/);
  } else {
    await page.goto('/login');
  }
  await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/back-office/);
  await page.goto('/back-office/organizer');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 450));
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath(`organizer-sticky-scrolled${suffix}`) });
});
