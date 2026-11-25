import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Ticket Header Anchor & Inspector SQL Hardening', () => {
  it('1. Verifies ticket-inspector.ts does not reference non-existent orders columns (paidAt, isDirectTicket)', () => {
    const filePath = path.resolve(process.cwd(), 'src/server/ticket-inspector.ts');
    const content = readFileSync(filePath, 'utf-8');

    // Confirm bogus column names are not queried from orders
    expect(content).not.toContain('o."paidAt"');
    expect(content).not.toContain('o."paymentMethod"');
    expect(content).not.toContain('o."isDirectTicket"');
    expect(content).not.toContain('FROM direct_ticket_batches');

    // Confirm proper expressions
    expect(content).toContain('(o."orderSource" = \'direct_issue\') AS "isDirectTicket"');
    expect(content).toContain('LOWER(t."qrPayload") = LOWER($1)');
    expect(content).toContain('UPPER(t."ticketCode") = UPPER($1)');
    expect(content).toContain('UPPER(t."orderId") = UPPER($1)');

    // D-14 Zero emojis
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('2. Verifies ticket-inspector-view.tsx removes sample tickets mockup and checks res.ok', () => {
    const filePath = path.resolve(process.cwd(), 'src/components/ticket-inspector-view.tsx');
    const content = readFileSync(filePath, 'utf-8');

    // Confirm mockup sample tickets selector is completely removed
    expect(content).not.toContain('ดึงบัตรตัวอย่างในระบบมาทดสอบทันที:');
    expect(content).not.toContain('action=recent-samples');
    expect(content).not.toContain('SampleTicketOption');

    // Confirm res.ok error handling
    expect(content).toContain('if (!res.ok)');

    // D-14 Zero emojis
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('3. Verifies owner direct-tickets API route supports customRecipientName and customRecipientEmail', () => {
    const filePath = path.resolve(process.cwd(), 'src/app/api/owner/direct-tickets/route.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain('customRecipientName');
    expect(content).toContain('customRecipientEmail');
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('4. Verifies ticket-canvas-download.ts anchors headers firmly and supports detail alignment', () => {
    const filePath = path.resolve(process.cwd(), 'src/components/ticket-canvas-download.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain('drawLabeledField');
    expect(content).toContain('isCenter');
    expect(content).toContain('anchorX');
    expect(content).toContain("headerWidth / 2");
    expect(content).toContain("ctx.textAlign = 'left'");

    // D-14 Zero emojis
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('5. Verifies admin-ticket-designer.tsx centers detail relative to header while locking header', () => {
    const filePath = path.resolve(process.cwd(), 'src/components/admin-ticket-designer.tsx');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain("transform: 'translateX(-50%)'");
    expect(content).toContain('headerWidth');
    expect(content).toContain('isCenter');
    expect(content).toContain("anchorX = isCenter ? posX + headerWidth / 2");

    // D-14 Zero emojis
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
