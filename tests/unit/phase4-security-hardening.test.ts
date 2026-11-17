import { describe, expect, it, vi } from 'vitest';
import { csvCell, csvRow } from '../../src/lib/csv';
import { validateTransferProof } from '../../src/server/proof-validation';
import { createUploadFinalizeToken, readStorageItemBounded } from '../../src/server/upload-finalization';
import { createOfflineAssignmentToken } from '../../src/server/offline-assignment-token';
import { serializeQueueCookie } from '../../src/server/queue-cookie';
import { destructiveDatabaseGuardErrors } from '../../scripts/destructive-db-guard';

describe('Phase 4 security hardening', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@SUM(A1:A2)', '\t=cmd', '\r=cmd', '  =cmd', ' \tcmd', ' \rcmd'])(
    'neutralizes formula prefixes and quotes CSV cell %j',
    input => {
      expect(csvCell(input)).toBe(`"'${input.replace(/"/g, '""')}"`);
    },
  );

  it('escapes quotes, commas, and embedded line breaks according to RFC 4180', () => {
    expect(csvCell('buyer, "name"\r\nsecond line')).toBe('"buyer, ""name""\r\nsecond line"');
    expect(csvRow('=1+1', 'safe')).toBe('"\'=1+1","safe"');
  });

  it('accepts transfer proof links only through the owner-authorized media route', () => {
    const valid = validateTransferProof('proofs/slip-01.pdf', '/api/media/proofs%2Fslip-01.pdf');
    expect(valid).toEqual({
      valid: true,
      transferProofKey: 'proofs/slip-01.pdf',
      transferProofUrl: '/api/media/proofs%2Fslip-01.pdf',
    });
    expect(validateTransferProof('proofs/slip-01.pdf', 'https://public-r2.invalid/proofs/slip-01.pdf').valid).toBe(false);
    expect(validateTransferProof('proofs/slip-01.pdf', '/api/media/proofs%2Fother.pdf').valid).toBe(false);
  });

  it('requires a local allowlisted database, non-production mode, and explicit reset flag', () => {
    const safe = {
      databaseUrl: 'postgresql://ticket:secret@127.0.0.1:55432/ticket_dev',
      nodeEnv: 'development',
      args: ['--confirm-reset-backoffice'],
      confirmationFlag: '--confirm-reset-backoffice',
    };
    expect(destructiveDatabaseGuardErrors(safe)).toEqual([]);
    expect(destructiveDatabaseGuardErrors({ ...safe, databaseUrl: 'postgresql://db/ticket_dev' })).toHaveLength(1);
    expect(destructiveDatabaseGuardErrors({ ...safe, databaseUrl: 'postgresql://localhost/production' })).toHaveLength(1);
    expect(destructiveDatabaseGuardErrors({ ...safe, nodeEnv: 'production' })).toContain(
      'destructive database scripts cannot run when NODE_ENV is production',
    );
    expect(destructiveDatabaseGuardErrors({ ...safe, args: [] })).toContain(
      'explicit confirmation flag --confirm-reset-backoffice is required',
    );
  });

  it('enforces the actual streamed object size even when Content-Length is absent or wrong', async () => {
    const tooLarge = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    await expect(readStorageItemBounded('pending/file.png', 4, {
      get: async () => null,
      getStream: async () => ({
        stream: tooLarge,
        contentType: 'image/png',
        visibility: 'public',
      }),
    })).rejects.toThrow('UPLOAD_TOO_LARGE');
  });

  it.each([
    { UPLOAD_FINALIZE_SECRET: 'short', BETTER_AUTH_SECRET: 'b'.repeat(32) },
    { UPLOAD_FINALIZE_SECRET: '', BETTER_AUTH_SECRET: 'short' },
  ])('fails closed in production when the selected upload signing secret is shorter than 32 characters', env => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPLOAD_FINALIZE_SECRET', env.UPLOAD_FINALIZE_SECRET);
    vi.stubEnv('BETTER_AUTH_SECRET', env.BETTER_AUTH_SECRET);
    try {
      expect(() => createUploadFinalizeToken({
        intentId: '123e4567-e89b-12d3-a456-426614174000',
        actorId: 'owner-1',
        uploadKey: 'pending/123e4567-e89b-12d3-a456-426614174000.png',
        key: 'posters/123e4567-e89b-12d3-a456-426614174000.png',
        contentType: 'image/png',
        visibility: 'public',
        maxFileSizeBytes: 1024,
        expiresAt: Date.now() + 60_000,
      })).toThrow(/at least 32 characters/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('trims optional signing secret overrides before fallback and length validation in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(32));
    try {
      vi.stubEnv('OFFLINE_ASSIGNMENT_SECRET', '   ');
      vi.stubEnv('QUEUE_TOKEN_SECRET', '   ');
      expect(() => createOfflineAssignmentToken({ eventId: 'ev-1', scannerId: 'sc-1', assignmentEpoch: 1 })).not.toThrow();
      expect(() => serializeQueueCookie('ev-1', 'qtok_1', 'sess-1')).not.toThrow();

      vi.stubEnv('OFFLINE_ASSIGNMENT_SECRET', '  short  ');
      expect(() => createOfflineAssignmentToken({ eventId: 'ev-1', scannerId: 'sc-1', assignmentEpoch: 1 })).toThrow(
        /at least 32 characters/,
      );

      vi.stubEnv('QUEUE_TOKEN_SECRET', '  short  ');
      expect(() => serializeQueueCookie('ev-1', 'qtok_1', 'sess-1')).toThrow(/at least 32 characters/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
