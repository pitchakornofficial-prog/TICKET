import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { authFixture, fixturePassword } from '../support/auth-fixture';
import {
  createEventDraft,
  addScannerToEvent,
  listScannersForEvent,
  removeScannerFromEvent,
  listEventsForScanner,
  resetScannerDeviceBinding,
} from '../../src/server/events';
import {
  signScannerEventScopeCookie,
  verifyScannerSessionEventScope,
} from '../../src/server/scanner-scope';

describe('Scanner account assignment and event-scoping integration (TASK-009, AC-09)', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  const baseURL = 'http://127.0.0.1:3100';
  let secondOrganizerId: string;

  beforeAll(async () => {
    fixture = await authFixture('integration', baseURL);

    // Create second organizer
    secondOrganizerId = randomUUID();
    const password = await hashPassword(fixturePassword);
    await fixture.pool.query(
      'INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, true, $4, now(), now())',
      [secondOrganizerId, 'ผู้จัดงานคนที่สอง', 'second-org@ticket.invalid', 'organizer'],
    );
    await fixture.pool.query(
      'INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $2, $4, now(), now())',
      [randomUUID(), secondOrganizerId, 'credential', password],
    );
  }, 30000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('organizer A adds scanner to Event A; organizer B cannot manage Event A; scanner sees only Event A', async () => {
    const orgA = fixture.ids.organizer;
    const orgB = secondOrganizerId;

    // 1. Organizer A creates Event A
    const eventA = await createEventDraft(
      fixture.pool,
      orgA,
      { title: 'คอนเสิร์ตผู้จัด A', location: 'อิมแพ็ค อารีน่า' },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP', price: 3500, quota: 100 }],
        },
      ],
    );

    // 2. Organizer B creates Event B
    const eventB = await createEventDraft(
      fixture.pool,
      orgB,
      { title: 'คอนเสิร์ตผู้จัด B', location: 'พารากอน ฮอลล์' },
      [
        {
          startTime: '2026-12-01T19:00:00.000Z',
          endTime: '2026-12-01T22:00:00.000Z',
          ticketTypes: [{ name: 'Regular', price: 1500, quota: 200 }],
        },
      ],
    );

    // 3. Organizer A adds scanner to Event A
    const scannerEmail = 'team-gate-a@ticket.invalid';
    const scannerResult = await addScannerToEvent(fixture.pool, orgA, eventA.id, {
      name: 'ทีมสแกน ประตู A',
      email: scannerEmail,
      password: 'Scanner-Secure-Password!001',
    });

    expect(scannerResult.scannerId).toBeDefined();
    expect(scannerResult.name).toBe('ทีมสแกน ประตู A');
    expect(scannerResult.email).toBe(scannerEmail);

    // Verify role in auth_user is scanner, not owner or organizer (AC-09)
    const userRow = await fixture.pool.query<{ role: string }>('SELECT role FROM auth_user WHERE id = $1', [scannerResult.scannerId]);
    expect(userRow.rows[0].role).toBe('scanner');

    // 4. Organizer A tries to add scanner to Event B (owned by Org B) -> MUST FAIL (AC-07, AC-09)
    await expect(
      addScannerToEvent(fixture.pool, orgA, eventB.id, {
        name: 'สแกนเนอร์ไม่ได้รับอนุญาต',
        email: 'unauthorized-scanner@ticket.invalid',
      }),
    ).rejects.toThrow('คุณไม่มีสิทธิ์จัดการทีมสแกนของงานนี้');

    // 5. Organizer B tries to list scanners for Event A -> MUST FAIL
    await expect(listScannersForEvent(fixture.pool, orgB, eventA.id)).rejects.toThrow('คุณไม่มีสิทธิ์เข้าถึงทีมสแกนของงานนี้');

    // 6. Organizer A lists scanners for Event A
    const scannersA = await listScannersForEvent(fixture.pool, orgA, eventA.id);
    expect(scannersA.length).toBe(1);
    expect(scannersA[0].email).toBe(scannerEmail);

    // 7. Scanner queries assigned events -> only sees Event A, not Event B
    const scannerEvents = await listEventsForScanner(fixture.pool, scannerResult.scannerId);
    expect(scannerEvents.length).toBe(1);
    expect(scannerEvents[0].id).toBe(eventA.id);
    expect(scannerEvents[0].title).toBe('คอนเสิร์ตผู้จัด A');
    expect(scannerEvents.some(e => e.id === eventB.id)).toBe(false);

    // 8. Organizer A removes scanner from Event A
    const removed = await removeScannerFromEvent(fixture.pool, orgA, eventA.id, scannerResult.scannerId);
    expect(removed).toBe(true);

    const afterRemove = await listEventsForScanner(fixture.pool, scannerResult.scannerId);
    expect(afterRemove.length).toBe(0);
  });

  it('implements D-104: tracks device binding on event_scanners and allows organizer to reset bound device', async () => {
    const orgA = fixture.ids.organizer;
    const orgB = secondOrganizerId;

    const event = await createEventDraft(
      fixture.pool,
      orgA,
      { title: 'คอนเสิร์ตทดสอบอุปกรณ์เดี่ยว', location: 'อิมแพ็ค อารีน่า' },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'VIP', price: 3500, quota: 100 }],
        },
      ],
    );

    const scanner = await addScannerToEvent(fixture.pool, orgA, event.id, {
      name: 'เจ้าหน้าที่ทดสอบเครื่อง',
      email: 'scanner-binding-test@ticket.invalid',
      password: 'Scanner-Secure-Password!001',
    });

    // 1. Initial state: unbound
    let scanners = await listScannersForEvent(fixture.pool, orgA, event.id);
    const targetScanner = scanners.find((s) => s.scannerId === scanner.scannerId);
    expect(targetScanner).toBeDefined();
    expect(targetScanner?.isBound).toBe(false);
    expect(targetScanner?.boundDeviceId).toBeNull();

    // 2. Simulate device binding (as done on /scanner/access)
    await fixture.pool.query(
      `UPDATE event_scanners
       SET "boundDeviceId" = $1, "boundAt" = now()
       WHERE "eventId" = $2 AND "scannerId" = $3`,
      ['mock-device-uuid-1', event.id, scanner.scannerId],
    );

    // 3. Verify binding in listScannersForEvent
    scanners = await listScannersForEvent(fixture.pool, orgA, event.id);
    const boundScanner = scanners.find((s) => s.scannerId === scanner.scannerId);
    expect(boundScanner?.isBound).toBe(true);
    expect(boundScanner?.boundDeviceId).toBe('mock-device-uuid-1');
    expect(boundScanner?.boundAt).toBeDefined();

    // 4. Unauthorized organizer B cannot reset device for Event A
    await expect(
      resetScannerDeviceBinding(fixture.pool, orgB, event.id, scanner.scannerId),
    ).rejects.toThrow('คุณไม่มีสิทธิ์จัดการงานคอนเสิร์ตนี้');

    // 5. Authorized organizer A resets device
    const resetResult = await resetScannerDeviceBinding(
      fixture.pool,
      orgA,
      event.id,
      scanner.scannerId,
    );
    expect(resetResult.success).toBe(true);
    expect(resetResult.message).toContain('รีเซ็ตอุปกรณ์เรียบร้อยแล้ว');

    // 6. Verify unbound state
    scanners = await listScannersForEvent(fixture.pool, orgA, event.id);
    const resetScanner = scanners.find((s) => s.scannerId === scanner.scannerId);
    expect(resetScanner?.isBound).toBe(false);
    expect(resetScanner?.boundDeviceId).toBeNull();
    expect(resetScanner?.boundAt).toBeNull();
  });

  it('implements D-105: organizer can query their own events for scanner terminal access with isPrimary=true', async () => {
    const orgA = fixture.ids.organizer;
    const orgB = secondOrganizerId;

    // Org A queries events for scanner terminal
    const orgAEvents = await listEventsForScanner(fixture.pool, orgA, 'organizer');
    expect(orgAEvents.length).toBeGreaterThanOrEqual(1);
    for (const ev of orgAEvents) {
      expect(ev.isPrimary).toBe(true);
      expect(ev.sessions).toBeDefined();
    }

    // Org B queries events for scanner terminal
    const orgBEvents = await listEventsForScanner(fixture.pool, orgB, 'organizer');
    // None of Org B's events should be Org A's events
    const orgAIds = new Set(orgAEvents.map((e) => e.id));
    for (const ev of orgBEvents) {
      expect(orgAIds.has(ev.id)).toBe(false);
    }
  });

  it('Issue #3: requires password verification when assigning existing scanner to another event and enforces scope', async () => {
    const orgA = fixture.ids.organizer;
    const orgB = secondOrganizerId;

    // 1. Org A creates Event A
    const eventA = await createEventDraft(
      fixture.pool,
      orgA,
      { title: 'งาน A ของผู้จัด 1', location: 'สถานที่ A' },
      [
        {
          startTime: '2026-11-20T19:00:00.000Z',
          endTime: '2026-11-20T22:00:00.000Z',
          ticketTypes: [{ name: 'Standard', price: 1000, quota: 50 }],
        },
      ],
    );

    // 2. Org B creates Event B
    const eventB = await createEventDraft(
      fixture.pool,
      orgB,
      { title: 'งาน B ของผู้จัด 2', location: 'สถานที่ B' },
      [
        {
          startTime: '2026-12-01T19:00:00.000Z',
          endTime: '2026-12-01T22:00:00.000Z',
          ticketTypes: [{ name: 'Standard', price: 1000, quota: 50 }],
        },
      ],
    );

    const sharedScannerEmail = 'shared-scanner@ticket.invalid';
    const scannerPassword = 'Correct-Scanner-Password-1234!';

    // Org A adds sharedScanner to Event A
    const scannerA = await addScannerToEvent(fixture.pool, orgA, eventA.id, {
      name: 'เจ้าหน้าที่แชร์งาน',
      email: sharedScannerEmail,
      password: scannerPassword,
    });
    expect(scannerA.scannerId).toBeDefined();

    // Org B attempts to add existing scanner without password -> rejects
    await expect(
      addScannerToEvent(fixture.pool, orgB, eventB.id, {
        name: 'สวมรอยแอดมิน',
        email: sharedScannerEmail,
      }),
    ).rejects.toThrow('บัญชีทีมสแกนนี้มีอยู่ในระบบแล้ว กรุณาระบุรหัสผ่านที่ถูกต้องของบัญชีเพื่อยืนยันการเพิ่มเข้างาน');

    // Org B attempts to add existing scanner with wrong password -> rejects
    await expect(
      addScannerToEvent(fixture.pool, orgB, eventB.id, {
        name: 'สวมรอยแอดมิน',
        email: sharedScannerEmail,
        password: 'Wrong-Password-456!',
      }),
    ).rejects.toThrow('รหัสผ่านของบัญชีทีมสแกนเดิมไม่ถูกต้อง');

    // Org B adds existing scanner with correct password -> succeeds
    const scannerB = await addScannerToEvent(fixture.pool, orgB, eventB.id, {
      name: 'เจ้าหน้าที่แชร์งาน',
      email: sharedScannerEmail,
      password: scannerPassword,
    });
    expect(scannerB.scannerId).toBe(scannerA.scannerId);

    // Verify event scope enforcement with verifyScannerSessionEventScope
    const secret = process.env.BETTER_AUTH_SECRET || 'dev-ticket-secret-32-bytes-minimum-length';
    const cookieHeaderEventB = `scanner_event_scope=${signScannerEventScopeCookie(eventB.id, secret)}`;

    // Access to event B with event B cookie -> allowed
    const scopeCheckAllowed = await verifyScannerSessionEventScope(
      fixture.pool,
      'scanner',
      cookieHeaderEventB,
      secret,
      { eventId: eventB.id },
    );
    expect(scopeCheckAllowed.allowed).toBe(true);

    // Access to event A with event B cookie -> denied
    const scopeCheckDenied = await verifyScannerSessionEventScope(
      fixture.pool,
      'scanner',
      cookieHeaderEventB,
      secret,
      { eventId: eventA.id },
    );
    expect(scopeCheckDenied.allowed).toBe(false);
    expect(scopeCheckDenied.reason).toContain('จำกัดสิทธิ์เฉพาะงานคอนเสิร์ตที่ได้รับมอบหมาย');
  });
});
