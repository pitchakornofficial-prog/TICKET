import { describe, expect, it, vi } from 'vitest';
import { handleTestInspectRequest } from '../support/test-inspect-handler';
import type { Pool } from 'pg';

describe('handleTestInspectRequest harness helper', () => {
  it('clears cooldown for user when clearCooldown=true', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-1' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    } as unknown as Pool;

    const res = await handleTestInspectRequest(mockPool, '/api/auth/test-inspect-reset-token?clearCooldown=true&email=owner@test.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cleared: true });
    expect(mockPool.query).toHaveBeenCalledWith('SELECT id FROM auth_user WHERE email = $1', ['owner@test.com']);
    expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM auth_rate_limit WHERE key = $1', ['reset_pwd:user-1']);
  });

  it('clears guest cooldown when type=clear_guest_cooldown', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    } as unknown as Pool;

    const res = await handleTestInspectRequest(mockPool, '/api/auth/test-inspect-reset-token?type=clear_guest_cooldown&email=guest@test.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cleared: true });
    expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM guest_otp_tracking WHERE key LIKE $1', ['guest@test.com:%']);
  });

  it('expires order when type=expire_order', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    } as unknown as Pool;

    const res = await handleTestInspectRequest(mockPool, '/api/auth/test-inspect-reset-token?type=expire_order&orderId=ORD-999');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ expired: true });
  });

  it('retrieves guest otp when type=guest_otp', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // ensureSchema
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ code: '123456', requestId: 'req-1' }] }),
    } as unknown as Pool;

    const res = await handleTestInspectRequest(mockPool, '/api/auth/test-inspect-reset-token?type=guest_otp&email=guest@test.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: '123456', requestId: 'req-1' });
  });

  it('returns 404 when guest otp not found', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
    } as unknown as Pool;

    const res = await handleTestInspectRequest(mockPool, '/api/auth/test-inspect-reset-token?type=guest_otp&email=unknown@test.com');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: null });
  });

  it('retrieves invitation token when type=invitation', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ token: 'inv-tok-123' }] }),
    } as unknown as Pool;

    const res = await handleTestInspectRequest(mockPool, '/api/auth/test-inspect-reset-token?type=invitation&email=org@test.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'inv-tok-123' });
  });

  it('retrieves reset token by default', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-reset-1' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ identifier: 'reset-password:raw-token-abc' }] }),
    } as unknown as Pool;

    const res = await handleTestInspectRequest(mockPool, '/api/auth/test-inspect-reset-token?email=reset@test.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'raw-token-abc' });
  });
});
