import { describe, it, expect } from 'vitest';
import { canAccessResource, roleAccess, type Actor } from '../../src/lib/back-office-access';

describe('Scanner role access and resource scoping unit tests (TASK-009, AC-09)', () => {
  const scannerActor: Actor = { id: 'scanner-1', role: 'scanner', name: 'ทีมสแกน' };
  const otherScannerActor: Actor = { id: 'scanner-2', role: 'scanner', name: 'ทีมสแกนอื่น' };
  const organizerActor: Actor = { id: 'org-1', role: 'organizer', name: 'ผู้จัดงาน' };

  it('scanner cannot access owner or organizer workspace', () => {
    expect(roleAccess(scannerActor, 'owner')).toBe('forbidden');
    expect(roleAccess(scannerActor, 'organizer')).toBe('forbidden');
    expect(roleAccess(scannerActor, 'scanner')).toBe('allowed');
  });

  it('scanner can only access events where their id is in scannerIds', () => {
    const assignedScope = {
      kind: 'event' as const,
      organizerId: 'org-1',
      scannerIds: ['scanner-1', 'scanner-3'],
    };

    expect(canAccessResource(scannerActor, assignedScope)).toBe(true);
    expect(canAccessResource(otherScannerActor, assignedScope)).toBe(false);
  });

  it('scanner cannot access non-event resources like proof or orders', () => {
    const proofScope = {
      kind: 'proof' as const,
      organizerId: 'org-1',
      scannerIds: ['scanner-1'],
    };
    const orderScope = {
      kind: 'order' as const,
      organizerId: 'org-1',
      scannerIds: ['scanner-1'],
    };

    expect(canAccessResource(scannerActor, proofScope)).toBe(false);
    expect(canAccessResource(scannerActor, orderScope)).toBe(false);
  });

  it('organizer can only access their own events, not other organizers', () => {
    const ownScope = { kind: 'event' as const, organizerId: 'org-1' };
    const otherScope = { kind: 'event' as const, organizerId: 'org-2' };

    expect(canAccessResource(organizerActor, ownScope)).toBe(true);
    expect(canAccessResource(organizerActor, otherScope)).toBe(false);
  });
});
