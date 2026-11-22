import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveEventRealStatus } from '../../src/components/organizer-overview-view';
import { DEFAULT_PROHIBITED_ITEMS } from '../../src/server/prohibited-items';

describe('Seven Issues Verification Suite', () => {
  describe('Issue 1: Scanner Admission Terminal Camera & Sound', () => {
    it('verifies audio beep and scanner structure exist in component file', () => {
      const content = readFileSync('src/components/scanner-admission-terminal.tsx', 'utf-8');
      expect(content).toContain('scanner-live-video');
      expect(content).toContain('playScanBeep');
      expect(content).toContain('navigator.mediaDevices.getUserMedia');
      expect(content).toContain('BarcodeDetector');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  describe('Issue 2: Ticket Designer & Real Ticket Canvas Centering', () => {
    it('verifies align property and center alignment logic in ticket-canvas-download', () => {
      const content = readFileSync('src/components/ticket-canvas-download.ts', 'utf-8');
      expect(content).toContain('align');
      expect(content).toContain('isCenter');
      expect(content).toContain("ctx.textAlign = 'center'");
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('verifies exportStudioCanvas in admin-ticket-designer includes centering math', () => {
      const content = readFileSync('src/components/admin-ticket-designer.tsx', 'utf-8');
      expect(content).toContain('align');
      expect(content).toContain('isCenter');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  describe('Issue 3: Regulations & Prohibited Items Management', () => {
    it('has default prohibited items list with required properties', () => {
      expect(DEFAULT_PROHIBITED_ITEMS.length).toBeGreaterThan(0);
      for (const item of DEFAULT_PROHIBITED_ITEMS) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('desc');
        expect(item).toHaveProperty('iconName');
      }
    });

    it('verifies owner regulations management UI in owner-system-hub', () => {
      const content = readFileSync('src/components/owner-system-hub.tsx', 'utf-8');
      expect(content).toContain('regulations');
      expect(content).toContain('/api/owner/prohibited-items');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  describe('Issue 4: Customer Fee Rate Dynamic Display & Calculation', () => {
    it('verifies fee rate label and dynamic rate in checkout flow', () => {
      const content = readFileSync('src/components/event-checkout-flow.tsx', 'utf-8');
      expect(content).toContain('feeRateLabel');
      expect(content).toContain('customerFeeRate');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  describe('Issue 5: 24-Hour Datetime Picker', () => {
    it('verifies DateTimePicker24h component handles 24h format', () => {
      const content = readFileSync('src/components/datetime-picker-24h.tsx', 'utf-8');
      expect(content).toContain('HOURS');
      expect(content).toContain('MINUTES');
      expect(content).toContain('length: 24');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  describe('Issue 6: Organizer Finance Report Platform Fee (3%)', () => {
    it('verifies 3% default rate across reports and finance calculations', () => {
      const reportsContent = readFileSync('src/server/reports.ts', 'utf-8');
      const reservationContent = readFileSync('src/server/reservation.ts', 'utf-8');
      expect(reportsContent).toContain('COALESCE(f."organizerFeeRate", 3)');
      expect(reservationContent).toContain('v_eff_of_rate := COALESCE(v_fee."organizerFeeRate"::numeric, 3)');
      expect(reportsContent).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(reservationContent).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  describe('Issue 7: Organizer Overview Status Resolution', () => {
    it('correctly identifies selling concerts within sales window', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const past = new Date(Date.now() - 86400000).toISOString();
      const ev = {
        id: 'ev-1',
        title: 'Live Concert',
        location: 'Hall A',
        status: 'approved',
        salesStartTime: past,
        salesEndTime: future,
        isSalesPaused: false,
      };
      const result = resolveEventRealStatus(ev);
      expect(result.code).toBe('selling');
      expect(result.label).toBe('กำลังเปิดขาย');
      expect(result.variant).toBe('success');
    });

    it('identifies sales paused concerts', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const past = new Date(Date.now() - 86400000).toISOString();
      const ev = {
        id: 'ev-2',
        title: 'Paused Concert',
        location: 'Hall A',
        status: 'approved',
        salesStartTime: past,
        salesEndTime: future,
        isSalesPaused: true,
      };
      const result = resolveEventRealStatus(ev);
      expect(result.code).toBe('sales_paused');
      expect(result.label).toBe('ระงับการขายชั่วคราว');
      expect(result.variant).toBe('warning');
    });

    it('identifies sales ended concerts when salesEndTime is in past', () => {
      const pastStart = new Date(Date.now() - 172800000).toISOString();
      const pastEnd = new Date(Date.now() - 86400000).toISOString();
      const ev = {
        id: 'ev-3',
        title: 'Ended Sales Concert',
        location: 'Hall A',
        status: 'approved',
        salesStartTime: pastStart,
        salesEndTime: pastEnd,
      };
      const result = resolveEventRealStatus(ev);
      expect(result.code).toBe('sales_ended');
      expect(result.label).toBe('ปิดการขายแล้ว');
      expect(result.variant).toBe('neutral');
    });

    it('identifies cancelled events', () => {
      const ev = {
        id: 'ev-4',
        title: 'Cancelled Concert',
        location: 'Hall A',
        status: 'cancelled',
      };
      const result = resolveEventRealStatus(ev);
      expect(result.code).toBe('cancelled');
      expect(result.label).toBe('ยกเลิกแล้ว');
      expect(result.variant).toBe('danger');
    });

    it('identifies draft and pending_approval events', () => {
      expect(resolveEventRealStatus({ id: '1', title: 'A', location: 'B', status: 'draft' }).code).toBe('draft');
      expect(resolveEventRealStatus({ id: '2', title: 'B', location: 'C', status: 'pending_approval' }).code).toBe('pending');
    });
  });
});
