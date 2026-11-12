import { expect, type Page } from '@playwright/test';

export async function reserveThroughCheckout(page: Page, input: {
  eventId: string;
  buyer: { name: string; email: string; phone: string };
  tickets: { name: string; quantity: number }[];
}) {
  await page.goto(`/events/${input.eventId}/checkout`);
  for (const ticket of input.tickets) {
    for (let index = 0; index < ticket.quantity; index++) {
      await page.getByRole('button', { name: `เพิ่มจำนวน ${ticket.name}`, exact: true }).click();
    }
  }
  await page.getByLabel('ชื่อ-นามสกุล *').fill(input.buyer.name);
  await page.getByLabel('อีเมลสำหรับรับบัตรและรหัส OTP *').fill(input.buyer.email);
  await page.getByLabel('เบอร์โทรศัพท์มือถือ *').fill(input.buyer.phone);
  await page.getByRole('checkbox', { name: /ฉันได้อ่านและยอมรับ/ }).check();
  await page.getByRole('button', { name: /(ยืนยันและไปหน้าชำระเงิน|ขอรหัส OTP เพื่อซื้อบัตร)/ }).click();
  const digits = page.getByRole('group', { name: 'ช่องกรอกรหัส OTP 6 หลัก' }).getByRole('textbox');
  if (await digits.first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
    const otp = await page.request.get(`/api/auth/test-inspect-reset-token?type=guest_otp&email=${encodeURIComponent(input.buyer.email)}`);
    expect(otp.status()).toBe(200);
    const { code } = await otp.json();
    expect(code).toMatch(/^\d{6}$/);
    for (let index = 0; index < code.length; index++) await digits.nth(index).fill(code[index]);
    await page.getByRole('button', { name: 'ยืนยันและไปหน้าชำระเงิน', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/orders\/ORD-[A-Z0-9-]+\/payment$/);
  await expect(page.locator('#promptpay-qr-image')).toBeVisible();
  return (await page.locator('#reservation-order-id').innerText()).trim();
}
