import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock getAuth and getDatabasePool
const mockGetSession = vi.fn();
vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: mockGetSession,
    },
  }),
}));

const mockQuery = vi.fn();
vi.mock('@/server/database', () => ({
  getDatabasePool: () => ({
    query: mockQuery,
  }),
}));

import { GET } from '@/app/api/organizer/payouts/[id]/slip/route';

describe('Security Audit Item 12: Organizer Payout Slip Access Security', () => {
  const rootDir = process.cwd();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies statically that organizer slip route only serves system-generated e-slip and does not access private storage', () => {
    const routeContent = readFileSync(
      join(rootDir, 'src/app/api/organizer/payouts/[id]/slip/route.ts'),
      'utf8',
    );

    // Must not import storage or use raw uploaded proof files
    expect(routeContent).not.toContain("from '@/server/storage'");
    expect(routeContent).not.toContain('storage.get');
    expect(routeContent).not.toContain('ep."transferProofKey"');
    expect(routeContent).not.toContain('ep."transferProofUrl"');
    expect(routeContent).not.toContain('Response.redirect');

    // Must generate system bank slip
    expect(routeContent).toContain('generateBankSlipSvg');
    expect(routeContent).toContain('generateBankSlipSvgDataUrl');
    expect(routeContent).toContain('hasUploadedProof: false');

    // Must enforce multi-tenant isolation
    expect(routeContent).toContain('payout.organizerId !== session.user.id');

    // D-14 compliance
    expect(routeContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const req = new Request('http://localhost:3000/api/organizer/payouts/payout-1/slip');
    const res = await GET(req, { params: Promise.resolve({ id: 'payout-1' }) });

    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain('Unauthorized');
  });

  it('rejects unauthorized roles (e.g. attendee) with 403', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'attendee-1', role: 'attendee' },
    });

    const req = new Request('http://localhost:3000/api/organizer/payouts/payout-1/slip');
    const res = await GET(req, { params: Promise.resolve({ id: 'payout-1' }) });

    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toContain('Forbidden');
  });

  it('rejects cross-tenant organizer access with 403', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'organizer-attacker', role: 'organizer' },
    });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'payout-1',
          eventId: 'evt-1',
          amount: '150000.00',
          paidAt: new Date('2026-05-15T10:00:00Z'),
          createdAt: new Date('2026-05-15T10:00:00Z'),
          transferNote: 'Weekly payout',
          organizerId: 'organizer-victim',
          eventTitle: 'Concert A',
          organizerName: 'Organizer Victim Co.',
        },
      ],
    });

    const req = new Request('http://localhost:3000/api/organizer/payouts/payout-1/slip');
    const res = await GET(req, { params: Promise.resolve({ id: 'payout-1' }) });

    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toContain('Forbidden');
    expect(text).toContain('คอนเสิร์ตอื่น');
  });

  it('serves system-generated SVG e-slip for authorized organizer', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'organizer-1', role: 'organizer' },
    });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'payout-1',
          eventId: 'evt-1',
          amount: '150000.00',
          paidAt: new Date('2026-05-15T10:00:00Z'),
          createdAt: new Date('2026-05-15T10:00:00Z'),
          transferNote: 'Weekly payout',
          organizerId: 'organizer-1',
          eventTitle: 'Concert A',
          organizerName: 'Organizer 1 Team',
        },
      ],
    });

    const req = new Request('http://localhost:3000/api/organizer/payouts/payout-1/slip');
    const res = await GET(req, { params: Promise.resolve({ id: 'payout-1' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('image/svg+xml');
    const svg = await res.text();
    expect(svg).toContain('<svg');
    expect(svg).toContain('โอนเงินสำเร็จ');
    expect(svg).toContain('Concert A');
  });

  it('returns JSON with generated slip dataUrl when Accept includes application/json', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'organizer-1', role: 'organizer' },
    });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'payout-1',
          eventId: 'evt-1',
          amount: '150000.00',
          paidAt: new Date('2026-05-15T10:00:00Z'),
          createdAt: new Date('2026-05-15T10:00:00Z'),
          transferNote: 'Weekly payout',
          organizerId: 'organizer-1',
          eventTitle: 'Concert A',
          organizerName: 'Organizer 1 Team',
        },
      ],
    });

    const req = new Request('http://localhost:3000/api/organizer/payouts/payout-1/slip', {
      headers: {
        Accept: 'application/json',
      },
    });
    const res = await GET(req, { params: Promise.resolve({ id: 'payout-1' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.hasUploadedProof).toBe(false);
    expect(data.slipUrl).toMatch(/^data:image\/svg\+xml;/);
  });
});
