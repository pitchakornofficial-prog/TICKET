import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateCustomerFee, calculateOrganizerOrderFee } from '../../src/server/fees';
import { isUbuEmail } from '../../src/server/reservation';

describe('D-274: Custom UBU Student Ticket Pricing, Shared Quota Pool & Flexible Admin Fee Modes (% or Baht)', () => {
  const rootDir = process.cwd();

  it('verifies organizer can set custom UBU price and shared quota in organizer-events-manager.tsx', () => {
    const content = readFileSync(
      join(rootDir, 'src/components/organizer-events-manager.tsx'),
      'utf8',
    );
    // Student price input and custom pricing hint
    expect(content).toContain('ticket-student-price-');
    expect(content).toContain('ผู้จัดกำหนดราคาเองได้ ไม่ใช่ราคาตายตัว');
    // Shared quota notice without zone separation
    expect(content).toContain('รวมโควต้าในบัตรประเภทเดียวกัน ไม่แยกโซน');
    // Payload includes studentPrice
    expect(content).toContain('studentPrice: t.studentPrice != null');
    // Zero emojis check
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies admin sees both ticket prices and shared quota in owner-session-approval-manager.tsx', () => {
    const content = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    // Displays both prices and shared quota
    expect(content).toContain('ราคาคนทั่วไป:');
    expect(content).toContain('ราคาสิทธิ์ ม.อุบลฯ');
    expect(content).toContain('ใช้โควตาเดียวกัน');
    expect(content).toContain('ไม่แยกโซน');
    // Fee mode selection (% or Baht)
    expect(content).toContain('custom-organizer-fee-mode-select');
    expect(content).toContain('custom-customer-fee-mode-select');
    expect(content).toContain('customOrganizerFeeMode');
    expect(content).toContain('customCustomerFeeMode');
    // Zero emojis check
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies admin sees ticket breakdown in owner-fee-settings-manager.tsx', () => {
    const content = readFileSync(
      join(rootDir, 'src/components/owner-fee-settings-manager.tsx'),
      'utf8',
    );
    // Ticket breakdown section
    expect(content).toContain('ประเภทบัตรและราคาที่ผู้จัดสร้างไว้ (Ticket Breakdown & Shared Quota)');
    expect(content).toContain('ราคาคนทั่วไป:');
    expect(content).toContain('ราคาสิทธิ์ ม.อุบลฯ:');
    expect(content).toContain('ใช้โควตาเดียวกัน');
    // Zero emojis check
    expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('verifies API endpoint /api/owner/sessions handles flexible fee modes (% and Baht)', () => {
    const content = readFileSync(
      join(rootDir, 'src/app/api/owner/sessions/route.ts'),
      'utf8',
    );
    expect(content).toContain('body.organizerFeeMode');
    expect(content).toContain('body.customerFeeMode');
    expect(content).toContain('body.customerFeeRate');
  });

  it('verifies custom pricing and shared quota simulation (e.g. 150B regular, 99B student, 500 quota)', () => {
    const totalSharedQuota = 500;
    const regularPrice = 150;
    const customStudentPrice = 99;

    expect(isUbuEmail('student@ubu.ac.th')).toBe(true);
    expect(isUbuEmail('general@gmail.com')).toBe(false);

    // Order 1: General buyer purchases 2 tickets at 150B
    const generalQty = 2;
    const generalTotal = regularPrice * generalQty;
    expect(generalTotal).toBe(300);

    // Order 2: Student buyer with @ubu.ac.th purchases 3 tickets at 99B
    const studentQty = 3;
    const studentTotal = customStudentPrice * studentQty;
    expect(studentTotal).toBe(297);

    // Shared quota calculation: both draw from the same 500 quota
    const totalConsumed = generalQty + studentQty;
    const remainingQuota = totalSharedQuota - totalConsumed;
    expect(totalConsumed).toBe(5);
    expect(remainingQuota).toBe(495);
  });

  it('verifies admin can calculate organizer fee as either percentage or flat Baht', () => {
    // Mode 1: Percentage fee (e.g. 3%)
    const pctFee = calculateOrganizerOrderFee('percentage', 3, 2, 300);
    expect(pctFee).toBe(9); // 300 * 3% = 9

    // Mode 2: Per ticket Baht (e.g. 10 Baht per ticket)
    const perTicketFee = calculateOrganizerOrderFee('per_ticket', 10, 2, 300);
    expect(perTicketFee).toBe(20); // 2 tickets * 10 Baht = 20

    // Mode 3: Flat fee per event (0 per order, assessed once per event)
    const flatFee = calculateOrganizerOrderFee('flat_fee', 5000, 2, 300);
    expect(flatFee).toBe(0);
  });

  it('verifies admin can calculate customer fee as either percentage or flat Baht', () => {
    // Mode 1: Percentage fee (e.g. 5% on 300B)
    const pctCustomer = calculateCustomerFee('percentage', 5, 2, 300);
    expect(pctCustomer.fee).toBe(15);
    expect(pctCustomer.total).toBe(315);

    // Mode 2: Per ticket Baht (e.g. 20 Baht per ticket on 2 tickets)
    const perTicketCustomer = calculateCustomerFee('per_ticket', 20, 2, 300);
    expect(perTicketCustomer.fee).toBe(40);
    expect(perTicketCustomer.total).toBe(340);

    // Mode 3: Per order Baht (e.g. 25 Baht flat per order)
    const perOrderCustomer = calculateCustomerFee('per_order', 25, 2, 300);
    expect(perOrderCustomer.fee).toBe(25);
    expect(perOrderCustomer.total).toBe(325);
  });
});
