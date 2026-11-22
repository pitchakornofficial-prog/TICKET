import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Payment QR Code Download Parity and Resilience', () => {
  const rootDir = process.cwd();

  it('verifies order-payment-view and download route handle payment QR download resiliently without CORS errors', () => {
    const paymentSrc = readFileSync(join(rootDir, 'src/components/order-payment-view.tsx'), 'utf8');
    const downloadRouteSrc = readFileSync(join(rootDir, 'src/app/api/public/checkout/orders/[id]/payment-qr/download/route.ts'), 'utf8');

    // Button and action exists
    expect(paymentSrc).toContain('id="download-qr-code-btn"');
    expect(paymentSrc).toContain('handleDownloadQrCode');
    expect(paymentSrc).toContain('promptpay-qr-');
    expect(paymentSrc).toContain('/payment-qr/download?token=');

    // Server-side route handles both data:image/svg+xml and external Stripe http/https URLs via sharp
    expect(downloadRouteSrc).toContain("qrCodeUrl.startsWith('data:image/svg+xml')");
    expect(downloadRouteSrc).toContain("qrCodeUrl.startsWith('http://') || qrCodeUrl.startsWith('https://')");
    expect(downloadRouteSrc).toContain('sharp');
    expect(downloadRouteSrc).toContain('Content-Disposition');

    // Client consumes clean Blob from same-origin endpoint and cleans up Object URL
    expect(paymentSrc).toContain('URL.createObjectURL(blob)');
    expect(paymentSrc).toContain('URL.revokeObjectURL(downloadUrl)');

    // Zero Emojis (D-14)
    expect(paymentSrc).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(downloadRouteSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies organizer-finance-view only sets crossOrigin on remote URLs', () => {
    const financeSrc = readFileSync(join(rootDir, 'src/components/organizer-finance-view.tsx'), 'utf8');
    expect(financeSrc).toContain("if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://'))");
    expect(financeSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
