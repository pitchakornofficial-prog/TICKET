import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toLocalDatetimeInputString } from '@/lib/locale';
import { getEventSalesStatus } from '@/lib/sales-window';

describe('D-278: Concert Data Integrity, Zero-Data-Loss Timezone Preservation & Emergency Sales Pause', () => {
  it('documents D-278 in docs/requirement.md with complete integrity, timezone, and emergency sales pause rules', () => {
    const reqPath = path.resolve(process.cwd(), 'docs/requirement.md');
    const content = fs.readFileSync(reqPath, 'utf8');
    expect(content).toContain('D-278');
    expect(content).toContain('Concert Data Integrity');
    expect(content).toContain('Zero-Data-Loss Timezone Preservation');
    expect(content).toContain('Emergency Sales Pause');
    expect(content).toContain('Admin All-in-One Edit Drawer');
  });

  it('formats local datetime input strings correctly without UTC shift using toLocalDatetimeInputString', () => {
    // 2026-12-25 19:30 local time
    const testDate = new Date(2026, 11, 25, 19, 30, 0);
    const formatted = toLocalDatetimeInputString(testDate);
    expect(formatted).toBe('2026-12-25T19:30');

    // Empty / null handling
    expect(toLocalDatetimeInputString(null)).toBe('');
    expect(toLocalDatetimeInputString('')).toBe('');
    expect(toLocalDatetimeInputString(undefined)).toBe('');
  });

  it('evaluates emergency sales pause status correctly in getEventSalesStatus', () => {
    const activeStatus = getEventSalesStatus({
      salesStartTime: new Date(Date.now() - 100000),
      salesEndTime: new Date(Date.now() + 100000),
      isSalesPaused: false,
    });
    expect(activeStatus.isOpen).toBe(true);
    expect(activeStatus.reason).toBe('open');

    const pausedStatus = getEventSalesStatus({
      salesStartTime: new Date(Date.now() - 100000),
      salesEndTime: new Date(Date.now() + 100000),
      isSalesPaused: true,
      salesPausedReason: 'ปรับปรุงระบบชั่วคราว',
    });
    expect(pausedStatus.isOpen).toBe(false);
    expect(pausedStatus.reason).toBe('paused');
    expect(pausedStatus.message).toBe('ปรับปรุงระบบชั่วคราว');
  });

  it('includes artists, isSalesPaused, and salesPausedReason in server events schema and inputs', () => {
    const eventsPath = path.resolve(process.cwd(), 'src/server/events.ts');
    const content = fs.readFileSync(eventsPath, 'utf8');
    expect(content).toContain('ALTER TABLE events ADD COLUMN IF NOT EXISTS artists TEXT');
    expect(content).toContain('ALTER TABLE events ADD COLUMN IF NOT EXISTS "isSalesPaused" BOOLEAN NOT NULL DEFAULT FALSE');
    expect(content).toContain('ALTER TABLE events ADD COLUMN IF NOT EXISTS "salesPausedReason" TEXT');
    expect(content).toContain('artists?: string');
    expect(content).toContain('isSalesPaused?: boolean');
    expect(content).toContain('salesPausedReason?: string');
  });

  it('guards database reservations against paused sales in src/server/reservation.ts', () => {
    const resPath = path.resolve(process.cwd(), 'src/server/reservation.ts');
    const content = fs.readFileSync(resPath, 'utf8');
    expect(content).toContain('v_ev."isSalesPaused" IS TRUE');
    expect(content).toContain('event.isSalesPaused');
  });

  it('integrates emergency sales toggle, confirmation modal, and lineup in OwnerSessionApprovalManager', () => {
    const approvalPath = path.resolve(process.cwd(), 'src/components/owner-session-approval-manager.tsx');
    const content = fs.readFileSync(approvalPath, 'utf8');
    expect(content).toContain('emergency-sales-toggle-btn');
    expect(content).toContain('emergency-toggle-modal');
    expect(content).toContain('handleOpenEmergencyToggle');
    expect(content).toContain('handleConfirmEmergencyToggle');
    expect(content).toContain('edit-concert-artists');
    expect(content).toContain('emergency-pause-control-card');
  });

  it('enforces strict D-14 zero emojis across all newly modified files', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const filesToCheck = [
      'docs/requirement.md',
      'src/lib/locale.ts',
      'src/lib/sales-window.ts',
      'src/lib/concert-csv-snapshot.ts',
      'src/server/events.ts',
      'src/server/reservation.ts',
      'src/app/api/events/route.ts',
      'src/app/api/events/[id]/route.ts',
      'src/app/events/[id]/page.tsx',
      'src/app/events/[id]/checkout/page.tsx',
      'src/components/event-checkout-flow.tsx',
      'src/components/organizer-events-manager.tsx',
      'src/components/owner-session-approval-manager.tsx',
      'src/app/back-office/back-office.css',
      'tests/unit/d278-concert-data-integrity-sales-pause.test.ts',
    ];
    for (const file of filesToCheck) {
      const fullPath = path.resolve(process.cwd(), file);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(emojiRegex.test(content)).toBe(false);
    }
  });
});
