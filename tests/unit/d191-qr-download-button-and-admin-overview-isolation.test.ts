import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-191 Minimal Outside QR Download Button & Overview Dashboard Exclusivity to Overview Tab', () => {
  const rootDir = process.cwd();

  it('verifies Item 1: QR download button is separated outside payment-qr-frame with minimal styling', () => {
    const paymentViewSrc = readFileSync(join(rootDir, 'src/components/order-payment-view.tsx'), 'utf8');

    // Button must exist
    expect(paymentViewSrc).toContain('id="download-qr-code-btn"');
    expect(paymentViewSrc).toContain('บันทึกรูป QR Code (PNG)');

    // Button must be placed outside payment-qr-frame
    const frameStart = paymentViewSrc.indexOf('className="payment-qr-frame"');
    const frameClose = paymentViewSrc.indexOf('</div>', frameStart);
    const buttonPos = paymentViewSrc.indexOf('id="download-qr-code-btn"');

    expect(frameStart).toBeGreaterThan(0);
    expect(frameClose).toBeGreaterThan(frameStart);
    expect(buttonPos).toBeGreaterThan(frameClose);

    // Minimal button styling
    const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
    expect(paymentViewSrc).toContain('payment-qr-download-container');
    expect(paymentViewSrc).toContain('download-qr-btn');
    expect(globalsCss).toContain('.download-qr-btn {');
    expect(globalsCss).toContain('.download-qr-btn:hover {');
    expect(globalsCss).toContain('transform: translateY(-1px);');

    // Zero emojis check (D-14)
    expect(paymentViewSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies Item 2: overview dashboard is isolated exclusively to the overview tab in OwnerWorkspaceView', () => {
    const workspaceSrc = readFileSync(join(rootDir, 'src/components/owner-workspace-view.tsx'), 'utf8');

    // Full overview rendered when activeSection === 'overview'
    expect(workspaceSrc).toContain("activeSection === 'overview' ?");
    expect(workspaceSrc).toContain('isFullOverview={true}');

    // Compact overview dashboard removed from other sections
    expect(workspaceSrc).not.toContain('isFullOverview={false}');

    // Zero emojis check (D-14)
    expect(workspaceSrc).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
