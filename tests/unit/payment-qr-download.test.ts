import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Payment QR Code Download Parity and Resilience', () => {
  const rootDir = process.cwd();

  it('verifies order-payment-view handles data URLs and Blob conversion without CORS errors', () => {
    const paymentSrc = readFileSync(join(rootDir, 'src/components/order-payment-view.tsx'), 'utf8');

    // Button and action exists
    expect(paymentSrc).toContain('id="download-qr-code-btn"');
    expect(paymentSrc).toContain('handleDownloadQrCode');
    expect(paymentSrc).toContain('promptpay-qr-');

    // Must handle data:image/svg+xml specifically
    expect(paymentSrc).toContain("imageSrc.startsWith('data:image/svg+xml')");
    expect(paymentSrc).toContain('new Blob([svgContent], { type: \'image/svg+xml;charset=utf-8\' })');
    expect(paymentSrc).toContain('URL.createObjectURL(svgBlob)');

    // Must only set crossOrigin on remote http/https URLs to prevent browser CORS failure on data/blob URLs
    expect(paymentSrc).toContain("if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://'))");

    // Must use canvas.toBlob for clean binary PNG download
    expect(paymentSrc).toContain("canvas.toBlob(resolve, 'image/png')");

    // Fallback must also use Blob ObjectURL instead of raw data URI navigation
    expect(paymentSrc).toContain('fallbackBlob = new Blob([svgContent], { type: \'image/svg+xml;charset=utf-8\' })');
    expect(paymentSrc).toContain('URL.createObjectURL(fallbackBlob)');

    // Must clean up Object URLs
    expect(paymentSrc).toContain('URL.revokeObjectURL');

    // Zero Emojis (D-14)
    expect(paymentSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies organizer-finance-view only sets crossOrigin on remote URLs', () => {
    const financeSrc = readFileSync(join(rootDir, 'src/components/organizer-finance-view.tsx'), 'utf8');
    expect(financeSrc).toContain("if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://'))");
    expect(financeSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
