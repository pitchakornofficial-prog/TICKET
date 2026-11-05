import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  calculateOrganizerOrderFee,
  calculateCustomerFee,
  roundHalfUp,
  saveEventFeeSettings,
} from '../../src/server/fees';
import { isUbuEmail } from '../../src/server/reservation';

describe('D-181: UBU Freshy Music Fest 2026, 6% Customer Fee, 150B/99B UBU Email Discount & Tiered 2%/3% Organizer Fee', () => {
  const rootDir = process.cwd();

  it('calculates tiered organizer fee correctly (2% for regular 150B tickets, 3% for UBU privilege 99B tickets)', () => {
    // 1 regular ticket at 150B -> fee: 150 * 0.02 = 3.00B
    const regFee = calculateOrganizerOrderFee('percentage', 2, 1, 150);
    expect(regFee).toBe(3);

    // 1 privilege ticket at 99B -> fee: 99 * 0.03 = 2.97B
    const privFee = calculateOrganizerOrderFee('percentage', 2, 1, 99, 3, 99);
    expect(privFee).toBe(2.97);

    // Mixed order: 2 regular tickets (300B) + 2 privilege tickets (198B) = 498B total
    // Regular fee = 300 * 2% = 6.00B
    // Privilege fee = 198 * 3% = 5.94B
    // Total = 11.94B
    const mixedFee = calculateOrganizerOrderFee('percentage', 2, 4, 498, 3, 198);
    expect(mixedFee).toBe(11.94);
  });

  it('calculates 6% customer fee with Math.ceil whole Baht rounding per D-181 / D-135', () => {
    // 1 regular ticket at 150B: 150 * 6% = 9.00B -> Total = 159B
    const regOrder = calculateCustomerFee('percentage', 6, 1, 150);
    const regFee = Math.ceil(regOrder.fee);
    expect(regFee).toBe(9);
    expect(roundHalfUp(150 + regFee)).toBe(159);

    // 1 privilege ticket at 99B: 99 * 6% = 5.94B -> Math.ceil = 6.00B -> Total = 105B
    const privOrder = calculateCustomerFee('percentage', 6, 1, 99);
    const privFee = Math.ceil(privOrder.fee);
    expect(privFee).toBe(6);
    expect(roundHalfUp(99 + privFee)).toBe(105);

    // 4 privilege tickets at 396B: 396 * 6% = 23.76B -> Math.ceil = 24.00B -> Total = 420B
    const multiPrivOrder = calculateCustomerFee('percentage', 6, 4, 396);
    const multiPrivFee = Math.ceil(multiPrivOrder.fee);
    expect(multiPrivFee).toBe(24);
    expect(roundHalfUp(396 + multiPrivFee)).toBe(420);
  });

  it('strictly validates UBU email domains for student privilege', () => {
    expect(isUbuEmail('somchai.s@ubu.ac.th')).toBe(true);
    expect(isUbuEmail('student67@eng.ubu.ac.th')).toBe(true);
    expect(isUbuEmail('organizer.freshy@ubu.ac.th')).toBe(true);
    expect(isUbuEmail('buyer@gmail.com')).toBe(false);
    expect(isUbuEmail('user@chula.ac.th')).toBe(false);
    expect(isUbuEmail('')).toBe(false);
  });

  it('seeds UBU Freshy Music Fest 2026 with 150B price, 4500 quota, and organizer account', () => {
    const eventsContent = readFileSync(join(rootDir, 'src/server/events.ts'), 'utf8');
    expect(eventsContent).toContain('seedUbuFreshyFest');
    expect(eventsContent).toContain('UBU Freshy Music Fest 2026');
    expect(eventsContent).toContain('organizer.freshy@ubu.ac.th');
    expect(eventsContent).toContain('ศูนย์กีฬาและนันทนาการ มหาวิทยาลัยอุบลราชธานี');
    expect(eventsContent).toContain('General Admission (บัตรเข้างานทั่วไป)');
    expect(eventsContent).toContain('150');
    expect(eventsContent).toContain('4500');
    expect(eventsContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('supports admin configuration in OwnerFeeSettingsManager with UBU privilege toggle and tiered rates', () => {
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-fee-settings-manager.tsx'),
      'utf8',
    );
    expect(managerContent).toContain('ubuPrivilegeMode');
    expect(managerContent).toContain('organizerFeePrivilegeRate');
    expect(managerContent).toContain('ubu-privilege-mode-switch');
    expect(managerContent).toContain('organizer-fee-privilege-rate');
    expect(managerContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('wires discount logic in reservation and checkout flow for all tickets when @ubu.ac.th is used', () => {
    const reservationContent = readFileSync(
      join(rootDir, 'src/server/reservation.ts'),
      'utf8',
    );
    expect(reservationContent).toContain('isUbuFreshyEvent');
    expect(reservationContent).toContain('(150 - 99)');
    expect(reservationContent).not.toMatch(/\p{Extended_Pictographic}/u);

    const checkoutContent = readFileSync(
      join(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf8',
    );
    expect(checkoutContent).toContain('isUbuFreshyEvent');
    expect(checkoutContent).toContain('150 - 99');
    expect(checkoutContent).toContain('0.06');
    expect(checkoutContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('executes saveEventFeeSettings correctly with all aligned parameters including privilege mode', async () => {
    let capturedQuery = '';
    let capturedValues: unknown[] = [];
    const mockPool = {
      query: async (queryText: string, values?: unknown[]) => {
        if (queryText.includes('CREATE TABLE') || queryText.includes('ALTER TABLE')) {
          return { rowCount: 0, rows: [] };
        }
        if (queryText.includes('SELECT id FROM events')) {
          return { rowCount: 1, rows: [{ id: 'event-ubu-freshy-2026' }] };
        }
        if (queryText.includes('SELECT "eventId", "organizerFeeMode"')) {
          return { rowCount: 1, rows: [{ eventId: 'event-ubu-freshy-2026', organizerFeeLocked: false }] };
        }
        if (queryText.includes('INSERT INTO event_fee_settings')) {
          capturedQuery = queryText;
          capturedValues = values || [];
          return {
            rowCount: 1,
            rows: [
              {
                eventId: capturedValues[0],
                organizerFeeMode: capturedValues[1],
                organizerFeeRate: capturedValues[2],
                organizerFeePrivilegeRate: capturedValues[3],
                ubuPrivilegeMode: capturedValues[4],
                customerFeeMode: capturedValues[5],
                customerFeeRate: capturedValues[6],
                reservePercentage: capturedValues[7],
                organizerFeeLocked: capturedValues[8],
                updatedBy: capturedValues[9],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const saved = await saveEventFeeSettings(
      mockPool as unknown as Parameters<typeof saveEventFeeSettings>[0],
      'event-ubu-freshy-2026',
      {
        organizerFeeMode: 'percentage',
        organizerFeeRate: 2,
        organizerFeePrivilegeRate: 3,
        ubuPrivilegeMode: true,
        customerFeeMode: 'percentage',
        customerFeeRate: 6,
        reservePercentage: 0,
      },
      'admin-user-id',
    );

    expect(saved.organizerFeeRate).toBe(2);
    expect(saved.organizerFeePrivilegeRate).toBe(3);
    expect(saved.ubuPrivilegeMode).toBe(true);
    expect(saved.customerFeeRate).toBe(6);
    expect(capturedValues.length).toBe(10);
    expect(capturedValues[0]).toBe('event-ubu-freshy-2026');
    expect(capturedValues[1]).toBe('percentage');
    expect(capturedValues[2]).toBe(2);
    expect(capturedValues[3]).toBe(3);
    expect(capturedValues[4]).toBe(true);
    expect(capturedValues[5]).toBe('percentage');
    expect(capturedValues[6]).toBe(6);
    expect(capturedValues[7]).toBe(0);
    expect(capturedValues[8]).toBe(false);
    expect(capturedValues[9]).toBe('admin-user-id');
    expect(capturedQuery).toContain('"organizerFeePrivilegeRate"');
    expect(capturedQuery).toContain('"ubuPrivilegeMode"');
  });
});
