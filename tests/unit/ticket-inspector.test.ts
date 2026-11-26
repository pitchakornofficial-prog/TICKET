import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Pool } from 'pg';
import {
  inspectTicketPayload,
  getRecentSampleTickets,
} from '../../src/server/ticket-inspector';

describe('Ticket QR Inspector & Tester (Unit Tests)', () => {
  const rootDir = process.cwd();

  const mockActorOwner = { id: 'user-owner', role: 'owner' as const, name: 'ระบบ Admin' };
  const mockActorOrganizer = { id: 'user-org-1', role: 'organizer' as const, name: 'ผู้จัดงาน 1' };
  const mockActorOtherOrganizer = { id: 'user-org-2', role: 'organizer' as const, name: 'ผู้จัดงาน 2' };

  it('rejects empty or whitespace input gracefully', async () => {
    const mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    const res = await inspectTicketPayload(mockPool, mockActorOwner, { qrPayloadOrCode: '   ' });
    expect(res.found).toBe(false);
    expect(res.message).toContain('กรุณาระบุรหัส QR Code');
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns not found when ticket code does not exist in database', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    } as unknown as Pool;

    const res = await inspectTicketPayload(mockPool, mockActorOwner, { qrPayloadOrCode: 'NON_EXISTENT_QR' });
    expect(res.found).toBe(false);
    expect(res.rawInput).toBe('NON_EXISTENT_QR');
    expect(res.message).toContain('ไม่พบบัตรในระบบ');
  });

  it('inspects valid ticket successfully by qrPayload and returns full details', async () => {
    const now = new Date();
    const mockTicketRow = {
      ticketId: 'tkt-123',
      ticketCode: 'TK-202611-0001-01',
      qrPayload: 'TKT-QR-VALID-123',
      ticketPrice: 2500,
      ticketStatus: 'valid',
      admissionStatus: 'outside',
      ticketCreatedAt: now,
      ticketUpdatedAt: now,
      eventId: 'ev-1',
      eventTitle: 'Concert Test Fest 2026',
      eventLocation: 'Hall 1, UBU',
      googleMapsUrl: 'https://maps.app.goo.gl/test',
      posterUrl: 'https://example.com/poster.jpg',
      eventStatus: 'approved',
      organizerId: 'user-org-1',
      organizerName: 'UBU Music Team',
      organizerEmail: 'organizer@ubu.ac.th',
      sessionId: 'sess-1',
      sessionStartTime: '2026-12-01T19:00:00Z',
      sessionEndTime: '2026-12-01T22:00:00Z',
      admissionStartTime: '2026-12-01T17:00:00Z',
      admissionEndTime: '2026-12-01T21:00:00Z',
      sessionStatus: 'approved',
      ticketTypeId: 'tt-vip',
      ticketTypeName: 'VIP Zone A',
      zonePrice: 2500,
      zoneQuota: 100,
      orderId: 'ORD-99999',
      buyerName: 'สมชาย รักดนตรี',
      buyerEmail: 'somchai@example.com',
      buyerPhone: '0812345678',
      orderStatus: 'paid',
      orderPaidAt: now,
      orderPaymentMethod: 'promptpay_qr',
      orderCreatedAt: now,
      isDirectTicket: false,
      totalTicketsInOrder: 2,
    };

    const mockLogsRow = [
      {
        id: 'log-1',
        action: 'entry',
        status: 'rejected',
        reason: 'GATE_NOT_OPEN',
        scannerName: 'Staff Gate A',
        deviceMode: 'online',
        createdAt: now,
      },
    ];

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM tickets t')) {
          return Promise.resolve({ rowCount: 1, rows: [mockTicketRow] });
        }
        if (sql.includes('FROM ticket_admission_logs')) {
          return Promise.resolve({ rowCount: 1, rows: mockLogsRow });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
    } as unknown as Pool;

    const res = await inspectTicketPayload(mockPool, mockActorOrganizer, {
      qrPayloadOrCode: 'TKT-QR-VALID-123',
    });

    expect(res.found).toBe(true);
    expect(res.ticket).toBeDefined();
    expect(res.ticket?.ticketCode).toBe('TK-202611-0001-01');
    expect(res.ticket?.status).toBe('valid');
    expect(res.ticket?.admissionStatus).toBe('outside');
    expect(res.ticket?.event.title).toBe('Concert Test Fest 2026');
    expect(res.ticket?.event.isAuthorizedEvent).toBe(true);
    expect(res.ticket?.zone.name).toBe('VIP Zone A');
    expect(res.ticket?.order.buyerName).toBe('สมชาย รักดนตรี');
    expect(res.ticket?.order.id).toBe('ORD-99999');
    expect(res.ticket?.admissionLogs).toHaveLength(1);
    expect(res.ticket?.admissionLogs[0].reason).toBe('GATE_NOT_OPEN');
  });

  it('marks isAuthorizedEvent as false when an organizer inspects another organizer concert', async () => {
    const mockTicketRow = {
      ticketId: 'tkt-other',
      ticketCode: 'TK-OTHER-001',
      qrPayload: 'TKT-QR-OTHER',
      ticketPrice: 1000,
      ticketStatus: 'valid',
      admissionStatus: 'inside',
      ticketCreatedAt: new Date(),
      ticketUpdatedAt: new Date(),
      eventId: 'ev-other',
      eventTitle: 'Other Concert',
      eventLocation: 'Other Location',
      googleMapsUrl: null,
      posterUrl: null,
      eventStatus: 'approved',
      organizerId: 'user-org-1', // belongs to user-org-1
      organizerName: 'Org 1',
      organizerEmail: 'org1@test.com',
      sessionId: 'sess-other',
      sessionStartTime: '2026-12-01T19:00:00Z',
      sessionEndTime: '2026-12-01T22:00:00Z',
      admissionStartTime: null,
      admissionEndTime: null,
      sessionStatus: 'approved',
      ticketTypeId: 'tt-reg',
      ticketTypeName: 'Regular',
      zonePrice: 1000,
      zoneQuota: 200,
      orderId: 'ORD-OTHER',
      buyerName: 'Buyer',
      buyerEmail: 'buyer@test.com',
      buyerPhone: null,
      orderStatus: 'paid',
      orderPaidAt: null,
      orderPaymentMethod: 'promptpay_qr',
      orderCreatedAt: new Date(),
      isDirectTicket: false,
      totalTicketsInOrder: 1,
    };

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM tickets t')) {
          return Promise.resolve({ rowCount: 1, rows: [mockTicketRow] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
    } as unknown as Pool;

    // mockActorOtherOrganizer (user-org-2) inspects ticket of user-org-1
    const res = await inspectTicketPayload(mockPool, mockActorOtherOrganizer, {
      qrPayloadOrCode: 'TK-OTHER-001',
    });

    expect(res.found).toBe(true);
    expect(res.ticket?.event.isAuthorizedEvent).toBe(false);
    expect(res.ticket?.admissionStatus).toBe('inside');
  });

  it('inspects ticket by orderId when order ID is entered', async () => {
    const mockOrderTicketRow = {
      ticketId: 'tkt-1',
      ticketCode: 'TK-ORDER-MATCH',
      qrPayload: 'TKT-ORDER-MATCH',
      ticketPrice: 1500,
      ticketStatus: 'valid',
      admissionStatus: 'outside',
      ticketCreatedAt: new Date(),
      ticketUpdatedAt: new Date(),
      eventId: 'ev-1',
      eventTitle: 'Event Title',
      eventLocation: 'Location',
      googleMapsUrl: null,
      posterUrl: null,
      eventStatus: 'approved',
      organizerId: 'user-owner',
      organizerName: 'Admin',
      organizerEmail: 'admin@test.com',
      sessionId: 'sess-1',
      sessionStartTime: '2026-12-01T19:00:00Z',
      sessionEndTime: '2026-12-01T22:00:00Z',
      admissionStartTime: null,
      admissionEndTime: null,
      sessionStatus: 'approved',
      ticketTypeId: 'tt-1',
      ticketTypeName: 'Zone 1',
      zonePrice: 1500,
      zoneQuota: 50,
      orderId: 'ORD-TARGET',
      buyerName: 'Buyer Name',
      buyerEmail: 'buyer@test.com',
      buyerPhone: null,
      orderStatus: 'paid',
      orderPaidAt: null,
      orderPaymentMethod: 'promptpay_qr',
      orderCreatedAt: new Date(),
      isDirectTicket: false,
      totalTicketsInOrder: 1,
    };

    const mockPool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM tickets t')) {
          return Promise.resolve({ rowCount: 1, rows: [mockOrderTicketRow] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
    } as unknown as Pool;

    const res = await inspectTicketPayload(mockPool, mockActorOwner, {
      qrPayloadOrCode: 'ORD-TARGET',
    });

    expect(res.found).toBe(true);
    expect(res.ticket?.ticketCode).toBe('TK-ORDER-MATCH');
  });

  it('fetches recent sample tickets for quick 1-click test', async () => {
    const mockSampleRows = [
      {
        ticketCode: 'TK-SAMPLE-1',
        qrPayload: 'TKT-SAMPLE-1',
        status: 'valid',
        admissionStatus: 'outside',
        eventTitle: 'Sample Concert A',
        ticketTypeName: 'VIP',
        buyerName: 'สมศรี',
      },
      {
        ticketCode: 'TK-SAMPLE-2',
        qrPayload: 'TKT-SAMPLE-2',
        status: 'valid',
        admissionStatus: 'inside',
        eventTitle: 'Sample Concert B',
        ticketTypeName: 'Regular',
        buyerName: 'สมปอง',
      },
    ];

    const mockPool = {
      query: vi.fn().mockResolvedValue({ rowCount: 2, rows: mockSampleRows }),
    } as unknown as Pool;

    const samples = await getRecentSampleTickets(mockPool, mockActorOwner);
    expect(samples).toHaveLength(2);
    expect(samples[0].ticketCode).toBe('TK-SAMPLE-1');
    expect(samples[1].admissionStatus).toBe('inside');
  });

  it('verifies TicketInspectorView and Page route file structure and integrations', () => {
    const pagePath = path.resolve(rootDir, 'src/app/back-office/ticket-inspector/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    expect(pageContent).toContain('TicketInspectorView');
    expect(pageContent).toContain('readActor');
    expect(pageContent).toContain('backLink');

    const viewPath = path.resolve(rootDir, 'src/components/ticket-inspector-view.tsx');
    const viewContent = fs.readFileSync(viewPath, 'utf8');
    expect(viewContent).toContain('BarcodeDetector');
    expect(viewContent).toContain('jsQR');
    expect(viewContent).toContain('handleUploadImageFile');
    expect(viewContent).toContain('handleInspect');
    expect(viewContent).toContain('playScanBeep');
    expect(viewContent).toContain('กล้องสแกนสด');
    expect(viewContent).toContain('อัปโหลดภาพ QR');
    expect(viewContent).toContain('กรอกรหัสค้นหา');

    const ownerWorkspacePath = path.resolve(rootDir, 'src/components/owner-workspace-view.tsx');
    const ownerWorkspaceContent = fs.readFileSync(ownerWorkspacePath, 'utf8');
    expect(ownerWorkspaceContent).toContain('ticket-inspector');
    expect(ownerWorkspaceContent).toContain('TicketInspectorView');

    const orgWorkspacePath = path.resolve(rootDir, 'src/components/organizer-workspace-view.tsx');
    const orgWorkspaceContent = fs.readFileSync(orgWorkspacePath, 'utf8');
    expect(orgWorkspaceContent).toContain('organizer-nav-ticket-inspector');
    expect(orgWorkspaceContent).toContain('TicketInspectorView');

    const terminalPath = path.resolve(rootDir, 'src/components/scanner-admission-terminal.tsx');
    const terminalContent = fs.readFileSync(terminalPath, 'utf8');
    expect(terminalContent).toContain('/back-office/ticket-inspector');
  });

  it('uses fixed-width non-shifting layout on desktop, keeps mobile result below scanner, and renders icon-only inactive tabs', () => {
    const viewPath = path.resolve(rootDir, 'src/components/ticket-inspector-view.tsx');
    const viewContent = fs.readFileSync(viewPath, 'utf8');
    expect(viewContent).toContain('ticket-inspector-layout');
    expect(viewContent).toContain('ticket-inspector-scanner-col');
    expect(viewContent).toContain('ticket-inspector-result-col');
    expect(viewContent).toContain('inspector-empty-result-placeholder');
    expect(viewContent).not.toContain('inspector-banner-next-scan-btn');
    expect(viewContent).not.toContain("gridTemplateColumns: result ? 'minmax(320px, 420px) 1fr' : '1fr'");
    expect(viewContent).toContain("{activeTab === 'camera' && <span>กล้องสแกนสด</span>}");
    expect(viewContent).toContain("{activeTab === 'upload' && <span>อัปโหลดภาพ QR</span>}");
    expect(viewContent).toContain("{activeTab === 'manual' && <span>กรอกรหัสค้นหา</span>}");

    // Icon-only camera, torch, switch camera, and rescan controls (centered)
    expect(viewContent).toContain('SwitchCameraIcon');
    expect(viewContent).toContain('data-testid="inspector-camera-actions-toolbar"');
    expect(viewContent).toContain("justifyContent: 'center'");
    expect(viewContent).toContain('data-testid="inspector-toggle-camera-btn"');
    expect(viewContent).toContain('data-testid="inspector-toggle-torch-btn"');
    expect(viewContent).toContain('data-testid="inspector-switch-camera-btn"');
    expect(viewContent).toContain('data-testid="inspector-rescan-btn"');

    // Clean header without heading icon, non-bold Kanit 400 headings, and outline submit button
    expect(viewContent).not.toContain('ShieldCheckIcon');
    expect(viewContent).not.toContain('fontWeight: 600');
    expect(viewContent).not.toContain('<strong>');
    expect(viewContent).not.toContain('className="primary-button"');
    expect(viewContent).toContain("fontSize: '1.5rem'");
    expect(viewContent).toContain('fontWeight: 400');

    const cssPath = path.resolve(rootDir, 'src/app/back-office/back-office.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    expect(cssContent).toMatch(/\.ticket-inspector-layout\s*\{[^}]*grid-template-columns:\s*400px minmax\(0, 1fr\)/);
    expect(cssContent).not.toMatch(/\.ticket-inspector-result-col\.has-result\s*\{[^}]*order:\s*-1/);
  });

  it('enforces strict D-14 zero emojis across all ticket inspector files', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const files = [
      path.resolve(rootDir, 'src/server/ticket-inspector.ts'),
      path.resolve(rootDir, 'src/app/api/back-office/tickets/inspect/route.ts'),
      path.resolve(rootDir, 'src/components/ticket-inspector-view.tsx'),
      path.resolve(rootDir, 'src/app/back-office/ticket-inspector/page.tsx'),
      path.resolve(rootDir, 'src/components/owner-workspace-view.tsx'),
      path.resolve(rootDir, 'src/components/organizer-workspace-view.tsx'),
      path.resolve(rootDir, 'src/components/scanner-admission-terminal.tsx'),
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).not.toMatch(emojiRegex);
    }
  });
});
