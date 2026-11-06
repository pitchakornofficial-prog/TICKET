import { describe, expect, it } from 'vitest';
import { assertSameOrigin, isAllowedOrigin } from '../../src/server/origin';

describe('CSRF and Origin protection (assertSameOrigin)', () => {
  it('allows safe HTTP methods (GET, HEAD, OPTIONS) without origin check', () => {
    const getReq = new Request('http://127.0.0.1:3000/api/owner/overview', {
      method: 'GET',
      headers: { Origin: 'https://attacker.invalid' },
    });
    expect(assertSameOrigin(getReq)).toBeNull();

    const headReq = new Request('http://127.0.0.1:3000/api/owner/overview', {
      method: 'HEAD',
      headers: { Origin: 'https://attacker.invalid' },
    });
    expect(assertSameOrigin(headReq)).toBeNull();

    const optionsReq = new Request('http://127.0.0.1:3000/api/owner/overview', {
      method: 'OPTIONS',
      headers: { Origin: 'https://attacker.invalid' },
    });
    expect(assertSameOrigin(optionsReq)).toBeNull();
  });

  it('allows state-changing requests from same local-loopback origins', () => {
    for (const origin of ['http://127.0.0.1:3000', 'http://localhost:3000', 'http://[::1]:3000']) {
      const postReq = new Request('http://127.0.0.1:3000/api/owner/invitations', {
        method: 'POST',
        headers: { Origin: origin },
      });
      expect(assertSameOrigin(postReq)).toBeNull();
    }
  });

  it('rejects foreign-origin state-changing requests with 403 Forbidden', async () => {
    for (const attackerOrigin of [
      'https://attacker.invalid',
      'http://evil.com',
      'null',
      'https://ticket.company.attacker.com',
    ]) {
      const postReq = new Request('http://127.0.0.1:3000/api/owner/invitations', {
        method: 'POST',
        headers: { Origin: attackerOrigin },
      });
      const response = assertSameOrigin(postReq);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
      const data = await response?.json();
      expect(data.message).toBe('ไม่อนุญาตคำขอจากแหล่งนี้');
    }
  });

  it('rejects requests with Sec-Fetch-Site: cross-site', async () => {
    const postReq = new Request('http://127.0.0.1:3000/api/owner/invitations', {
      method: 'POST',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        'Sec-Fetch-Site': 'cross-site',
      },
    });
    const response = assertSameOrigin(postReq);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it('validates referer if origin is missing', async () => {
    // Valid referer
    const validReq = new Request('http://127.0.0.1:3000/api/owner/invitations', {
      method: 'POST',
      headers: { Referer: 'http://127.0.0.1:3000/back-office/owner' },
    });
    expect(assertSameOrigin(validReq)).toBeNull();

    // Invalid referer
    const invalidReq = new Request('http://127.0.0.1:3000/api/owner/invitations', {
      method: 'POST',
      headers: { Referer: 'https://attacker.invalid/back-office' },
    });
    const response = assertSameOrigin(invalidReq);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it('supports production HTTPS origin matching strictly', () => {
    const prodBase = 'https://tickets.example.com';
    expect(isAllowedOrigin('https://tickets.example.com', prodBase)).toBe(true);
    expect(isAllowedOrigin('http://tickets.example.com', prodBase)).toBe(false);
    expect(isAllowedOrigin('https://sub.tickets.example.com', prodBase)).toBe(false);
    expect(isAllowedOrigin('https://attacker.com', prodBase)).toBe(false);
  });

  describe('Direct route handler CSRF protection', () => {
    it('blocks cross-site POST /api/owner/invitations before database or session access', async () => {
      const { POST: postInvitation } = await import('../../src/app/api/owner/invitations/route');
      const req = new Request('http://127.0.0.1:3000/api/owner/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil-attacker.com',
        },
        body: JSON.stringify({ email: 'attacker@evil.com', role: 'owner' }),
      });
      const res = await postInvitation(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.message).toBe('ไม่อนุญาตคำขอจากแหล่งนี้');
    });

    it('blocks cross-site POST /api/owner/refunds/[id]/approve', async () => {
      const { POST: postApproveRefund } = await import('../../src/app/api/owner/refunds/[id]/approve/route');
      const req = new Request('http://127.0.0.1:3000/api/owner/refunds/ref-123/approve', {
        method: 'POST',
        headers: {
          Origin: 'https://evil-attacker.com',
        },
      });
      const res = await postApproveRefund(req, {
        params: Promise.resolve({ id: 'ref-123' }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.message).toBe('ไม่อนุญาตคำขอจากแหล่งนี้');
    });

    it('blocks cross-site POST /api/events', async () => {
      const { POST: postEvents } = await import('../../src/app/api/events/route');
      const req = new Request('http://127.0.0.1:3000/api/events', {
        method: 'POST',
        headers: {
          Origin: 'https://evil-attacker.com',
        },
      });
      const res = await postEvents(req);
      expect(res.status).toBe(403);
    });

    it('blocks cross-site POST /api/organizer/events/[id]/sessions/[sessionId]/cancel', async () => {
      const { POST: postCancel } = await import(
        '../../src/app/api/organizer/events/[id]/sessions/[sessionId]/cancel/route'
      );
      const req = new Request('http://127.0.0.1:3000/api/organizer/events/e-1/sessions/s-1/cancel', {
        method: 'POST',
        headers: {
          Origin: 'https://evil-attacker.com',
        },
      });
      const res = await postCancel(req, {
        params: Promise.resolve({ id: 'e-1', sessionId: 's-1' }),
      });
      expect(res.status).toBe(403);
    });
  });
});

