import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  saveOrderTransactionMemo,
  getOrderTransactionMemos,
  getOrderItemsForOrder,
} from '@/server/transaction-memo';

describe('D-276: Admin Order & Transaction Audit Drawer and Double-Check System', () => {
  it('documents D-276 in docs/requirement.md with complete audit, drawer, and confirmation rules', () => {
    const reqPath = path.resolve(process.cwd(), 'docs/requirement.md');
    const content = fs.readFileSync(reqPath, 'utf8');
    expect(content).toContain('D-276');
    expect(content).toContain('Transaction Audit Drawer');
    expect(content).toContain('Double-Check');
  });

  it('exports transaction memo functions from src/server/transaction-memo.ts', () => {
    expect(typeof saveOrderTransactionMemo).toBe('function');
    expect(typeof getOrderTransactionMemos).toBe('function');
    expect(typeof getOrderItemsForOrder).toBe('function');
  });

  it('implements API route /api/owner/orders/[id]/transaction-memo with POST and GET methods', () => {
    const routePath = path.resolve(process.cwd(), 'src/app/api/owner/orders/[id]/transaction-memo/route.ts');
    expect(fs.existsSync(routePath)).toBe(true);
    const content = fs.readFileSync(routePath, 'utf8');
    expect(content).toContain('export async function POST');
    expect(content).toContain('export async function GET');
    expect(content).toContain('saveOrderTransactionMemo');
  });

  it('includes memo drawer, confirmation modal, and verified badge in OwnerCustomerHub', () => {
    const hubPath = path.resolve(process.cwd(), 'src/components/owner-customer-hub.tsx');
    const content = fs.readFileSync(hubPath, 'utf8');
    expect(content).toContain('memoOrder');
    expect(content).toContain('handleOpenMemoDrawer');
    expect(content).toContain('handleConfirmSaveMemo');
    expect(content).toContain('isConfirmingSave');
    expect(content).toContain('memo-slide-over-drawer');
    expect(content).toContain('memo-confirmation-dialog');
    expect(content).toContain('บันทึกแล้ว');
  });

  it('protects ticket designer buttons against solid black overrides in back-office.css', () => {
    const cssPath = path.resolve(process.cwd(), 'src/app/back-office/back-office.css');
    const content = fs.readFileSync(cssPath, 'utf8');
    expect(content).toContain('.fullscreen-ticket-studio button');
    expect(content).toContain('.owner-workspace-container .fullscreen-ticket-studio button');
    expect(content).toContain('.canvas-scale-dock');
  });

  it('enforces strict D-14 zero emojis across newly modified files', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const filesToCheck = [
      'src/server/transaction-memo.ts',
      'src/app/api/owner/orders/[id]/transaction-memo/route.ts',
      'src/components/owner-customer-hub.tsx',
    ];
    for (const file of filesToCheck) {
      const fullPath = path.resolve(process.cwd(), file);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(emojiRegex.test(content)).toBe(false);
    }
  });
});
