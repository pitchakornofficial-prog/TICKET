import { describe, expect, it, vi } from 'vitest';
import {
  RESET_COOLDOWN_SECONDS,
  RESET_MAX_REQUESTS_IN_WINDOW,
  RESET_TOKEN_EXPIRATION_SECONDS,
  RESET_WINDOW_SECONDS,
} from '../../src/server/password-reset';
import { handleAuthRequest } from '../../src/server/auth-http';
import type { TicketAuth } from '../../src/server/auth';
import type { Pool } from 'pg';

describe('password reset security constants under G-18/ADR-0004', () => {
  it('enforces 30-minute token expiration and 60-second cooldown', () => {
    expect(RESET_TOKEN_EXPIRATION_SECONDS).toBe(1800);
    expect(RESET_COOLDOWN_SECONDS).toBe(60);
  });

  it('enforces maximum 3 requests per 15-minute sliding window', () => {
    expect(RESET_MAX_REQUESTS_IN_WINDOW).toBe(3);
    expect(RESET_WINDOW_SECONDS).toBe(900);
  });

  it('strictly rejects test inspection endpoints with 404 and does not query DB', async () => {
    const mockPool = {
      query: vi.fn(),
    } as unknown as Pool;
    const mockAuth = {
      options: { database: mockPool, baseURL: 'http://127.0.0.1:3000' },
      handler: vi.fn(),
    } as unknown as TicketAuth;

    const urls = [
      'http://127.0.0.1:3000/api/auth/test-inspect-reset-token',
      'http://127.0.0.1:3000/api/auth/test-inspect-reset-token?email=owner@ticket.invalid',
      'http://127.0.0.1:3000/api/auth/test-inspect-reset-token?type=invitation&email=owner@ticket.invalid',
      'http://127.0.0.1:3000/api/auth/test-inspect-reset-token?type=guest_otp&email=buyer@example.test',
      'http://127.0.0.1:3000/api/auth/test-inspect-reset-token?type=expire_order&orderId=ORD-123',
      'http://127.0.0.1:3000/api/auth/test-inspect-reset-token?clearCooldown=true&email=owner@ticket.invalid',
    ];

    for (const url of urls) {
      const req = new Request(url, { method: 'GET' });
      const res = await handleAuthRequest(mockAuth, req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.message).toBe('ไม่พบเส้นทางที่ร้องขอ');
    }

    expect(mockPool.query).not.toHaveBeenCalled();
    expect(mockAuth.handler).not.toHaveBeenCalled();
  });
});
