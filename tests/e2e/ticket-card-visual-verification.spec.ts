import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { DEFAULT_STATE } from '../../src/lib/ticket-master-template-sync';
import { fixtureAccounts, fixturePassword } from '../support/auth-fixture';
import { testClientIp } from '../support/client-context';
import { reserveThroughCheckout } from '../support/purchase-journey';

const ARTIFACT_DIR =
  'C:/Users/pitch/.gemini/antigravity/brain/3846ee9e-e32c-4e4e-8442-50c1261f1594';

test.beforeEach(async ({ context }, testInfo) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testClientIp(testInfo) });
});

test.describe('Ticket Card Visual Verification (Browser-Rendered Email Flow)', () => {
  test('verifies and captures screenshots across direct quota, email card PNG, order success, ticket lookup, and captured email', async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    const eventTitle = 'คอนเสิร์ต ก้อง ห้วยไร่ ทดสอบบัตร';
    const guestEmail = `visual-browser-${testInfo.project.name}@ticket.invalid`;
    const guestName = 'สมชาย รักดนตรี';
    const guestPhone = '0812345678';

    // 1. Organizer creates event & submits session
    await page.goto('/login');
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.organizer.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/organizer');

    const createRes = await page.request.post('/api/events', {
      data: {
        title: eventTitle,
        location: 'ศูนย์ประชุมและแสดงสินค้านานาชาติ เชียงใหม่ (Hall 1)',
        limitPerOrder: 4,
        sessions: [
          {
            startTime: '2026-12-24T12:00:00.000Z',
            endTime: '2026-12-24T15:00:00.000Z',
            ticketTypes: [{ name: 'VIP ZONE A', price: 1800, quota: 20 }],
          },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const createdData = await createRes.json();
    const createdEvent = createdData.event;
    const sessionId = createdEvent.sessions[0].id;
    const ticketTypeId = createdEvent.sessions[0].ticketTypes[0].id;

    await page.request.post(`/api/events/${createdEvent.id}?action=submit-session`, {
      data: { sessionId },
    });

    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 2. Owner configures custom master ticket template (full DEFAULT_STATE + custom banner + white text)
    await page.getByLabel('อีเมล', { exact: true }).fill(fixtureAccounts.owner.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(fixturePassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).toHaveURL('/back-office/owner');

    const customBannerSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0%" stop-color="#5b0f13"/><stop offset="55%" stop-color="#8b1e24"/><stop offset="100%" stop-color="#5b0f13"/></linearGradient></defs><rect width="1000" height="420" fill="url(#g)"/><rect x="12" y="12" width="976" height="396" rx="8" fill="none" stroke="#d4af37" stroke-width="2"/><text x="40" y="95" font-family="sans-serif" font-size="48" font-weight="700" fill="#facc15">KONG HUAYRAI</text><text x="105" y="125" font-family="sans-serif" font-size="16" fill="#fde68a">CHAMPA GAMES 19th</text></svg>';
    const customBgPng = await sharp(Buffer.from(customBannerSvg)).png().toBuffer();
    const customBgDataUrl = `data:image/png;base64,${customBgPng.toString('base64')}`;

    const baseEls = DEFAULT_STATE.elements;
    const customElements = {
      ...baseEls,
      brandLogo: { ...baseEls.brandLogo, visible: false },
      gateInfo: { ...baseEls.gateInfo, visible: false },
      seatInfo: { ...baseEls.seatInfo, visible: false },
      priceInfo: { ...baseEls.priceInfo, visible: false },
      barcode: { ...baseEls.barcode, visible: false },
      stubEventSummary: { ...baseEls.stubEventSummary, visible: false },
      scanHint: { ...baseEls.scanHint, visible: false },
      eventTitle: { ...baseEls.eventTitle, visible: true, color: '#ffffff', y: 165, fontSize: 24 },
      zoneBadge: { ...baseEls.zoneBadge, visible: true, color: '#ffffff', y: 202 },
      dateTime: { ...baseEls.dateTime, visible: true, color: '#ffffff', secondaryColor: '#e2e8f0', y: 235 },
      venue: { ...baseEls.venue, visible: true, color: '#ffffff', secondaryColor: '#e2e8f0', y: 280 },
      ticketCode: { ...baseEls.ticketCode, visible: true, color: '#ffffff', secondaryColor: '#e2e8f0', y: 325 },
      buyerName: { ...baseEls.buyerName, visible: true, color: '#ffffff', secondaryColor: '#e2e8f0', y: 325 },
      footerNote: { ...baseEls.footerNote, visible: true, color: '#f8fafc', y: 382 },
      qrCode: { ...baseEls.qrCode, visible: true, x: 754, y: 84, size: 155 },
      qrCodeLabel: { ...baseEls.qrCodeLabel, visible: true, color: '#ffffff', secondaryColor: '#e2e8f0', y: 263 },
      orderId: { ...baseEls.orderId, visible: true, color: '#ffffff', secondaryColor: '#e2e8f0', y: 362 },
    };

    const tplSaveRes = await page.request.post('/api/owner/ticket-master-template', {
      data: {
        template: {
          ...DEFAULT_STATE,
          presetId: 'custom-banner',
          bgType: 'image',
          bgImageUrl: customBgDataUrl,
          tearLineStyle: 'none',
          borderColor: '#d4af37',
          borderWidth: 2,
          elements: customElements,
        },
      },
    });
    expect(tplSaveRes.status()).toBe(200);

    // Approve session
    const sessionCard = page.locator('.pending-session-card', { hasText: eventTitle });
    await expect(sessionCard).toBeVisible();
    await sessionCard.getByRole('button', { name: 'อนุมัติด่วน' }).click();
    await expect(page.getByText(`อนุมัติรอบการแสดงของ "${eventTitle}" สำเร็จ`)).toBeVisible();

    // 3. Issue direct quota ticket & trigger browser-rendered email upload via resend-email modal
    const directRes = await page.request.post('/api/owner/direct-tickets', {
      data: {
        eventId: createdEvent.id,
        sessionId,
        items: [{ ticketTypeId, quantity: 1 }],
        recipientMode: 'custom',
        recipientName: 'ผู้รับโควต้า ทดสอบ',
        recipientEmail: `quota-browser-${testInfo.project.name}@ticket.invalid`,
        recipientPhone: '0891112222',
        priceDisplayMode: 'complimentary',
        sendEmail: false,
        deferEmail: true,
      },
    });
    expect(directRes.status()).toBe(201);
    const directData = await directRes.json();
    const directOrderId = directData.orderId as string;
    const directTicketId = directData.tickets?.[0]?.id as string;
    expect(directTicketId).toBeTruthy();

    await page.goto('/back-office/owner#direct-tickets');
    await expect(page.getByText('ผู้รับโควต้า ทดสอบ').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(ARTIFACT_DIR, 'final_direct_quota_ui.png'),
      fullPage: false,
    });

    // Open detail modal & click ส่งอีเมลซ้ำ to verify browser-rendered PNG upload
    await page.locator('tr', { hasText: 'ผู้รับโควต้า ทดสอบ' }).locator('button').first().click();
    const resendBtn = page.getByRole('button', { name: 'ส่งอีเมลซ้ำ' });
    await expect(resendBtn).toBeVisible({ timeout: 10000 });
    const resendPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/owner/direct-tickets/${directOrderId}/resend-email`) &&
        res.request().method() === 'POST',
    );
    await resendBtn.click();
    const resendRes = await resendPromise;
    expect(resendRes.status()).toBe(200);
    const reqBody = resendRes.request().postDataJSON() as {
      renderedImages?: Array<{ ticketId: string; dataUrl: string }>;
    };
    expect(reqBody.renderedImages?.length).toBe(1);

    const directCardImgRes = await page.request.get(
      `/api/public/tickets/${encodeURIComponent(directTicketId)}/image`,
    );
    expect(directCardImgRes.status()).toBe(200);
    writeFileSync(join(ARTIFACT_DIR, 'final_direct_quota_email_card.png'), await directCardImgRes.body());

    await page.locator('.direct-modal-card .modal-close-btn, .direct-modal-card button[aria-label*="ปิด"]').first().click().catch(() => {});
    await page.goto('/back-office/owner');
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(page).toHaveURL('/login');

    // 4. Guest completes purchase -> Order Success syncs browser-rendered PNG
    const orderId = await reserveThroughCheckout(page, {
      eventId: createdEvent.id,
      buyer: { name: guestName, email: guestEmail, phone: guestPhone },
      tickets: [{ name: 'VIP ZONE A', quantity: 1 }],
    });
    expect(orderId).toMatch(/^ORD-/);

    const qrImage = page.locator('#promptpay-qr-image');
    await expect(qrImage).toBeVisible({ timeout: 15000 });
    const simulateBtn = page.locator('#simulate-payment-button');
    await expect(simulateBtn).toBeVisible();
    await expect(simulateBtn).toBeEnabled();
    await page.waitForTimeout(400);

    const syncUploadPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/public/tickets/') &&
        res.url().endsWith('/image') &&
        res.request().method() === 'POST',
      { timeout: 25000 },
    );

    await simulateBtn.click();
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}/success`), { timeout: 20000 });

    const ticketsTabBtn = page.locator('#tab-btn-tickets');
    await expect(ticketsTabBtn).toBeVisible({ timeout: 15000 });
    await ticketsTabBtn.click();
    await expect(page.locator('.ticket-card').first()).toBeVisible({ timeout: 15000 });
    const firstTicketId = await page.locator('.ticket-card').first().getAttribute('data-ticket-id');

    const syncRes = await syncUploadPromise;
    expect(syncRes.status()).toBe(200);
    await page.waitForTimeout(600);

    await page.screenshot({
      path: join(ARTIFACT_DIR, 'final_order_success_ui.png'),
      fullPage: true,
    });

    if (firstTicketId) {
      const orderCardImgRes = await page.request.get(
        `/api/public/tickets/${encodeURIComponent(firstTicketId)}/image`,
      );
      expect(orderCardImgRes.status()).toBe(200);
      writeFileSync(join(ARTIFACT_DIR, 'final_order_success_email_card.png'), await orderCardImgRes.body());
    }

    // 5. Ticket Lookup (/my-tickets)
    await page.goto('/my-tickets');
    await page.locator('#lookup-email').fill(guestEmail);
    await page.locator('#lookup-phone').fill(guestPhone);
    await page.getByRole('button', { name: 'ขอรหัส OTP เพื่อเปิดดูบัตร' }).click();
    await expect(page.getByRole('heading', { name: 'ยืนยันรหัส OTP' })).toBeVisible();

    const lookupOtpRes = await request.get(
      `/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(guestEmail)}`,
    );
    expect(lookupOtpRes.status()).toBe(200);
    const { code: lookupOtpCode } = await lookupOtpRes.json();

    await page.locator('#lookup-otp-code').fill(lookupOtpCode);
    await page.getByRole('button', { name: 'ยืนยันรหัส OTP' }).click();

    await expect(page.getByText('รายการบัตรเข้างาน (1 ใบ)')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(ARTIFACT_DIR, 'final_ticket_lookup_ui.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(ARTIFACT_DIR, 'final_mobile_ticket_lookup_ui.png'),
      fullPage: true,
    });

    // 6. Render captured email HTML preview if available
    const capturedRes = await page.request.get('/api/dev/captured-emails');
    if (capturedRes.ok()) {
      const capturedData = (await capturedRes.json()) as {
        emails?: Array<{ to?: string; subject?: string; html?: string }>;
      };
      const ticketEmail = (capturedData.emails || []).find(
        (e) => e.to === guestEmail && typeof e.html === 'string' && e.html.includes('/image'),
      );
      if (ticketEmail?.html) {
        await page.setContent(ticketEmail.html, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        await page.screenshot({
          path: join(ARTIFACT_DIR, 'final_captured_email_preview.png'),
          fullPage: true,
        });
      }
    }
  });
});
