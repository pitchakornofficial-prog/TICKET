import { describe, expect, it, vi } from 'vitest';
import { recordInvitationAuditLog } from '../../src/server/invitation';
import { hashPassword } from 'better-auth/crypto';
import type { Pool } from 'pg';

vi.mock('@/server/origin', () => ({
  assertSameOrigin: () => null,
}));

const mockSession = {
  user: { id: 'owner-user-1', name: 'Main Owner', email: 'owner@ticket.invalid', role: 'owner' },
};

vi.mock('@/server/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => (mockSession.user ? { session: { id: 's-1' }, user: mockSession.user } : null),
    },
    options: {
      baseURL: 'http://127.0.0.1:3000',
    },
  }),
}));

let mockQueryResult: (queryText: string, params: unknown[]) => Promise<{ rowCount: number; rows: unknown[] }> = async () => ({
  rowCount: 0,
  rows: [],
});

const mockPoolInstance = {
  query: vi.fn().mockImplementation((q: string, p: unknown[]) => mockQueryResult(q, p)),
  connect: vi.fn().mockResolvedValue({
    query: vi.fn().mockImplementation((q: string, p: unknown[]) => mockQueryResult(q, p)),
    release: vi.fn(),
  }),
};

vi.mock('@/server/database', () => ({
  getDatabasePool: () => mockPoolInstance,
  inTransaction: async (_pool: unknown, callback: (client: unknown) => Promise<unknown>) => callback(mockPoolInstance),
}));

describe('Item 11: Owner Invitation Step-Up Authentication & Audit Trail', () => {
  it('records invitation audit log into invitation_audit_logs table', async () => {
    const insertedValues: unknown[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((queryText: string, params: unknown[]) => {
        if (queryText.includes('CREATE TABLE') || queryText.includes('ALTER TABLE') || queryText.includes('CREATE INDEX')) {
          return { rowCount: 0, rows: [] };
        }
        if (queryText.includes('INSERT INTO invitation_audit_logs')) {
          insertedValues.push(...params);
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }),
    } as unknown as Pool;

    await recordInvitationAuditLog(mockPool, {
      invitationId: 'inv-123',
      invitedEmail: 'admin-partner@ticket.invalid',
      invitedRole: 'owner',
      issuedByUserId: 'owner-user-1',
      issuedByName: 'Main Owner',
      issuedByEmail: 'owner@ticket.invalid',
      ipAddress: '192.0.2.1',
    });

    expect(insertedValues).toHaveLength(9);
    expect(insertedValues[1]).toBe('inv-123');
    expect(insertedValues[2]).toBe('admin-partner@ticket.invalid');
    expect(insertedValues[3]).toBe('owner');
    expect(insertedValues[4]).toBe('owner-user-1');
  });

  it('rejects owner invitation without password confirmation with 400 Bad Request', async () => {
    const { POST } = await import('../../src/app/api/owner/invitations/route');
    const req = new Request('http://127.0.0.1:3000/api/owner/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new-owner@example.com', role: 'owner' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('กรุณาระบุรหัสผ่านปัจจุบันของคุณเพื่อยืนยันการเชิญผู้ดูแลระบบ');
  });

  it('rejects owner invitation when wrong password is provided with 403 Forbidden', async () => {
    const validPassword = 'CorrectOwnerPassword!123';
    const hashedPassword = await hashPassword(validPassword);

    mockQueryResult = async (queryText: string) => {
      if (queryText.includes('SELECT password FROM auth_account')) {
        return { rowCount: 1, rows: [{ password: hashedPassword }] };
      }
      return { rowCount: 0, rows: [] };
    };

    const { POST } = await import('../../src/app/api/owner/invitations/route');
    const req = new Request('http://127.0.0.1:3000/api/owner/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new-owner@example.com',
        role: 'owner',
        confirmPassword: 'WrongPassword!999',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toContain('รหัสผ่านยืนยันไม่ถูกต้อง');
  });

  it('allows owner invitation when correct password is provided', async () => {
    const validPassword = 'CorrectOwnerPassword!123';
    const hashedPassword = await hashPassword(validPassword);

    mockQueryResult = async (queryText: string) => {
      if (queryText.includes('SELECT password FROM auth_account')) {
        return { rowCount: 1, rows: [{ password: hashedPassword }] };
      }
      if (queryText.includes('FROM auth_user WHERE email =')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    };

    const { POST } = await import('../../src/app/api/owner/invitations/route');
    const req = new Request('http://127.0.0.1:3000/api/owner/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'verified-owner@example.com',
        role: 'owner',
        confirmPassword: validPassword,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('ส่งคำเชิญสำเร็จ');
    expect(body.role).toBe('owner');
    // Ensure token is NOT leaked in JSON response
    expect(body.token).toBeUndefined();
    expect(body.inviteUrl).toBeUndefined();
  });
});
