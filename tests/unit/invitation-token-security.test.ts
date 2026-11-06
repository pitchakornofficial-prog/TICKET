import { describe, expect, it, vi } from 'vitest';
import {
  createOrganizerInvitation,
  hashInvitationToken,
  listOrganizerInvitations,
  verifyInvitation,
} from '../../src/server/invitation';
import { clearCapturedEmails, getCapturedEmails } from '../../src/server/email';
import type { Pool } from 'pg';

describe('Invitation Token Hashing & Exposure Prevention (Item 10)', () => {
  it('computes sha256 hex digest for invitation tokens', () => {
    const rawToken = 'test-raw-token-12345';
    const hash = hashInvitationToken(rawToken);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(rawToken);
  });

  it('stores hashed token in database, not raw token', async () => {
    clearCapturedEmails();
    const insertedValues: unknown[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((queryText: string, params: unknown[]) => {
        if (queryText.includes('CREATE TABLE')) return { rowCount: 0, rows: [] };
        if (queryText.includes('ALTER TABLE')) return { rowCount: 0, rows: [] };
        if (queryText.includes('CREATE INDEX')) return { rowCount: 0, rows: [] };
        if (queryText.includes('FROM auth_user')) return { rowCount: 0, rows: [] };
        if (queryText.includes('UPDATE organizer_invitations')) return { rowCount: 0, rows: [] };
        if (queryText.includes('INSERT INTO organizer_invitations')) {
          insertedValues.push(...params);
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockImplementation((queryText: string, params: unknown[]) => {
          if (queryText.includes('FROM auth_user')) return { rowCount: 0, rows: [] };
          if (queryText.includes('UPDATE organizer_invitations')) return { rowCount: 0, rows: [] };
          if (queryText.includes('INSERT INTO organizer_invitations')) {
            insertedValues.push(...params);
            return { rowCount: 1, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        }),
        release: vi.fn(),
      }),
    } as unknown as Pool;

    const email = 'new-org@example.com';
    const result = await createOrganizerInvitation(
      mockPool,
      email,
      'http://127.0.0.1:3000',
      new Date(),
      'organizer',
    );

    // Raw token is generated and returned to internal caller
    expect(result.token).toBeDefined();
    expect(result.token.length).toBeGreaterThanOrEqual(32);

    // Database receives the SHA-256 hash, NOT the raw token
    const tokenInDb = insertedValues[2] as string;
    expect(tokenInDb).toBe(hashInvitationToken(result.token));
    expect(tokenInDb).not.toBe(result.token);

    // Email contains raw token for the recipient
    const captured = getCapturedEmails();
    expect(captured.length).toBeGreaterThan(0);
    const sentEmail = captured.find((e) => e.to === email);
    expect(sentEmail?.text).toContain(`token=${result.token}`);
    expect(sentEmail?.text).not.toContain(`token=${tokenInDb}`);
  });

  it('verifies invitation by matching hashed token against database', async () => {
    const rawToken = 'user-invitation-token-abc';
    const expectedHash = hashInvitationToken(rawToken);

    const mockPool = {
      query: vi.fn().mockImplementation((queryText: string, params: unknown[]) => {
        if (queryText.includes('CREATE TABLE') || queryText.includes('ALTER TABLE') || queryText.includes('CREATE INDEX')) {
          return { rowCount: 0, rows: [] };
        }
        if (queryText.includes('FROM organizer_invitations WHERE token = $1 OR token = $2')) {
          expect(params[0]).toBe(expectedHash);
          expect(params[1]).toBe(rawToken);
          return {
            rowCount: 1,
            rows: [
              {
                id: 'inv-1',
                email: 'invited@example.com',
                role: 'owner',
                status: 'pending',
                expiresAt: new Date(Date.now() + 100000),
              },
            ],
          };
        }
        return { rowCount: 0, rows: [] };
      }),
    } as unknown as Pool;

    const verification = await verifyInvitation(mockPool, rawToken);
    expect(verification.valid).toBe(true);
    expect(verification.email).toBe('invited@example.com');
    expect(verification.role).toBe('owner');
  });

  it('listOrganizerInvitations does not leak tokens', async () => {
    const mockPool = {
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText.includes('CREATE TABLE') || queryText.includes('ALTER TABLE') || queryText.includes('CREATE INDEX')) {
          return { rowCount: 0, rows: [] };
        }
        if (queryText.includes('FROM organizer_invitations')) {
          // Verify token is NOT requested in SELECT
          expect(queryText).not.toContain('token');
          return {
            rowCount: 1,
            rows: [
              {
                id: 'inv-1',
                email: 'org@example.com',
                role: 'organizer',
                status: 'pending',
                expiresAt: new Date(Date.now() + 100000).toISOString(),
                createdAt: new Date().toISOString(),
                acceptedAt: null,
              },
            ],
          };
        }
        return { rowCount: 0, rows: [] };
      }),
    } as unknown as Pool;

    const list = await listOrganizerInvitations(mockPool);
    expect(list).toHaveLength(1);
    expect((list[0] as Record<string, unknown>).token).toBeUndefined();
    expect((list[0] as Record<string, unknown>).tokenHash).toBeUndefined();
  });
});
