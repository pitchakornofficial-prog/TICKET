import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock auth and server modules
const mockGetSession = vi.fn();
const mockReadActor = vi.fn();

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: mockGetSession,
    },
    options: {
      database: {},
    },
  }),
  readActor: () => mockReadActor(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@/server/database', () => ({
  getDatabasePool: () => ({}),
}));

const mockGetPayoutProof = vi.fn();
vi.mock('@/server/reports', () => ({
  getPayoutProof: (...args: unknown[]) => mockGetPayoutProof(...args),
}));

const mockGetRefundTransferProof = vi.fn();
vi.mock('@/server/refunds', () => ({
  getRefundTransferProof: (...args: unknown[]) => mockGetRefundTransferProof(...args),
}));

import { GET as getPayoutProofRoute } from '@/app/api/owner/payouts/[id]/proof/route';
import { GET as getRefundProofRoute } from '@/app/api/owner/refunds/[id]/proof/route';

describe('Security Audit Item 20: Proof Download Security Headers (nosniff, CSP sandbox, X-Frame-Options)', () => {
  const rootDir = process.cwd();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('statically checks that owner payout proof route includes all required security headers', () => {
    const routeContent = readFileSync(
      join(rootDir, 'src/app/api/owner/payouts/[id]/proof/route.ts'),
      'utf8',
    );

    expect(routeContent).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(routeContent).toContain("'Content-Security-Policy': \"default-src 'none'; sandbox\"");
    expect(routeContent).toContain("'X-Frame-Options': 'DENY'");
    expect(routeContent).toContain("'Content-Disposition': contentDisposition");
    expect(routeContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('statically checks that owner refund proof route includes all required security headers', () => {
    const routeContent = readFileSync(
      join(rootDir, 'src/app/api/owner/refunds/[id]/proof/route.ts'),
      'utf8',
    );

    expect(routeContent).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(routeContent).toContain("'Content-Security-Policy': \"default-src 'none'; sandbox\"");
    expect(routeContent).toContain("'X-Frame-Options': 'DENY'");
    expect(routeContent).toContain("'Content-Disposition': contentDisposition");
    expect(routeContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('serves payout proof image with nosniff, CSP, and inline disposition for owner', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'owner-1', role: 'owner' },
    });
    mockGetPayoutProof.mockResolvedValueOnce({
      success: true,
      data: Buffer.from('fake-image-bytes'),
      contentType: 'image/png',
    });

    const req = new Request('http://localhost:3000/api/owner/payouts/payout-123/proof');
    const res = await getPayoutProofRoute(req, {
      params: Promise.resolve({ id: 'payout-123' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="payout-proof-payout-123.png"');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('serves payout proof PDF with attachment disposition for owner', async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'owner-1', role: 'owner' },
    });
    mockGetPayoutProof.mockResolvedValueOnce({
      success: true,
      data: Buffer.from('fake-pdf-bytes'),
      contentType: 'application/pdf',
    });

    const req = new Request('http://localhost:3000/api/owner/payouts/payout-456/proof');
    const res = await getPayoutProofRoute(req, {
      params: Promise.resolve({ id: 'payout-456' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="payout-proof-payout-456.pdf"');
  });

  it('serves refund proof image with nosniff, CSP, and inline disposition for owner', async () => {
    mockReadActor.mockResolvedValueOnce({
      id: 'owner-1',
      role: 'owner',
    });
    mockGetRefundTransferProof.mockResolvedValueOnce({
      success: true,
      data: Buffer.from('fake-image-bytes'),
      contentType: 'image/jpeg',
    });

    const req = new Request('http://localhost:3000/api/owner/refunds/ref-789/proof');
    const res = await getRefundProofRoute(req, {
      params: Promise.resolve({ id: 'ref-789' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="refund-proof-ref-789.jpg"');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('serves refund proof PDF with attachment disposition for owner', async () => {
    mockReadActor.mockResolvedValueOnce({
      id: 'owner-1',
      role: 'owner',
    });
    mockGetRefundTransferProof.mockResolvedValueOnce({
      success: true,
      data: Buffer.from('fake-pdf-bytes'),
      contentType: 'application/pdf',
    });

    const req = new Request('http://localhost:3000/api/owner/refunds/ref-101/proof');
    const res = await getRefundProofRoute(req, {
      params: Promise.resolve({ id: 'ref-101' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="refund-proof-ref-101.pdf"');
  });
});
