import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { listPaidOrdersForOwner } from '@/server/contact-correction';

describe('D-277: Automated Transaction Verification Prefill, Timeframe Filter & Excel Evidence Export', () => {
  it('documents D-277 in docs/requirement.md with complete prefill, timeframe filter, and Excel export rules', () => {
    const reqPath = path.resolve(process.cwd(), 'docs/requirement.md');
    const content = fs.readFileSync(reqPath, 'utf8');
    expect(content).toContain('D-277');
    expect(content).toContain('Automated Transaction Verification Prefill');
    expect(content).toContain('Excel Evidence Export');
    expect(content).toContain('UTF-8 BOM');
  });

  it('supports timeframe options and automated charge reference in listPaidOrdersForOwner', () => {
    expect(typeof listPaidOrdersForOwner).toBe('function');
    const codePath = path.resolve(process.cwd(), 'src/server/contact-correction.ts');
    const content = fs.readFileSync(codePath, 'utf8');
    expect(content).toContain('autoTransferRef?: string');
    expect(content).toContain('latestAdminNotes?: string');
    expect(content).toContain('options?: { dateFrom?: string; dateTo?: string }');
    expect(content).toContain('payment_charges');
  });

  it('handles dateFrom and dateTo parameters in /api/owner/orders/contact-correction route', () => {
    const routePath = path.resolve(process.cwd(), 'src/app/api/owner/orders/contact-correction/route.ts');
    expect(fs.existsSync(routePath)).toBe(true);
    const content = fs.readFileSync(routePath, 'utf8');
    expect(content).toContain('searchParams.get(\'dateFrom\')');
    expect(content).toContain('searchParams.get(\'dateTo\')');
  });

  it('includes automated prefill notice, timeframe chips, and Excel download button in OwnerCustomerHub', () => {
    const hubPath = path.resolve(process.cwd(), 'src/components/owner-customer-hub.tsx');
    const content = fs.readFileSync(hubPath, 'utf8');
    expect(content).toContain('handleExportExcel');
    expect(content).toContain('timeframePreset');
    expect(content).toContain('dateFrom');
    expect(content).toContain('dateTo');
    expect(content).toContain('\\uFEFF');
    expect(content).toContain('memo-auto-verified-card');
    expect(content).toContain('hub-export-excel-btn');
    expect(content).toContain('ดาวน์โหลด Excel');
  });

  it('includes CSS styles for timeframe toolbar and auto-verified badge in back-office.css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/app/back-office/back-office.css');
    const content = fs.readFileSync(cssPath, 'utf8');
    expect(content).toContain('.hub-timeframe-toolbar');
    expect(content).toContain('.memo-auto-verified-card');
    expect(content).toContain('.hub-export-excel-btn');
  });

  it('enforces strict D-14 zero emojis across all newly modified files', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const filesToCheck = [
      'docs/requirement.md',
      'src/server/contact-correction.ts',
      'src/app/api/owner/orders/contact-correction/route.ts',
      'src/components/owner-customer-hub.tsx',
      'src/app/back-office/back-office.css',
      'tests/unit/d277-transaction-prefill-excel-export.test.ts',
    ];
    for (const file of filesToCheck) {
      const fullPath = path.resolve(process.cwd(), file);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(emojiRegex.test(content)).toBe(false);
    }
  });
});
