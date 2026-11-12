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
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    const svg = await res.text();
    expect(svg).toContain('<svg');
    expect(svg).toContain('โอนเงินสำเร็จ');
    expect(svg).toContain('Concert A');
  });

  it('escapes XML markup in eventTitle, organizerName, and transferNote in SVG and dataUrl responses', async () => {
    const untrustedTitle = 'Music </text><script>void(0)</script><text>';
    const untrustedName = 'Org & "Co" <img onerror="void(0)">';
    const untrustedNote = "Note '1' <tag>";

    mockGetSession.mockResolvedValueOnce({
      user: { id: 'owner-1', role: 'owner' },
    });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'payout-xss',
          eventId: 'evt-xss',
          amount: '1000.00',
          paidAt: new Date('2026-05-15T10:00:00Z'),
          createdAt: new Date('2026-05-15T10:00:00Z'),
          transferNote: untrustedNote,
          organizerId: 'organizer-1',
          eventTitle: untrustedTitle,
          organizerName: untrustedName,
        },
      ],
    });

    const svgReq = new Request('http://localhost:3000/api/organizer/payouts/payout-xss/slip');
    const svgRes = await GET(svgReq, { params: Promise.resolve({ id: 'payout-xss' }) });
    expect(svgRes.status).toBe(200);
    expect(svgRes.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");

    const svg = await svgRes.text();
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<img ');
    expect(svg).not.toContain('<tag>');
    expect(svg).toContain('&lt;/text&gt;&lt;script&gt;void(0)&lt;/script&gt;&lt;text&gt;');
    expect(svg).toContain('Org &amp; &quot;Co&quot; &lt;img onerror=&quot;void(0)&quot;&gt;');
    expect(svg).toContain('Note &#39;1&#39; &lt;tag&gt;');

    mockGetSession.mockResolvedValueOnce({
      user: { id: 'organizer-1', role: 'organizer' },
    });
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'payout-xss',
          eventId: 'evt-xss',
          amount: '1000.00',
          paidAt: new Date('2026-05-15T10:00:00Z'),
          createdAt: new Date('2026-05-15T10:00:00Z'),
          transferNote: untrustedNote,
          organizerId: 'organizer-1',
          eventTitle: untrustedTitle,
          organizerName: untrustedName,
        },
      ],
    });

    const jsonReq = new Request('http://localhost:3000/api/organizer/payouts/payout-xss/slip', {
      headers: { Accept: 'application/json' },
    });
    const jsonRes = await GET(jsonReq, { params: Promise.resolve({ id: 'payout-xss' }) });
    expect(jsonRes.status).toBe(200);
    const json = await jsonRes.json();
    const decodedSvg = decodeURIComponent(String(json.slipUrl).replace('data:image/svg+xml;utf8,', ''));
    expect(decodedSvg).not.toContain('<script>');
    expect(decodedSvg).toContain('&lt;/text&gt;&lt;script&gt;void(0)&lt;/script&gt;&lt;text&gt;');
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
