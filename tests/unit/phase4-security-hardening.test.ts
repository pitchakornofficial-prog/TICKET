import { describe, expect, it } from 'vitest';
import { csvCell, csvRow } from '../../src/lib/csv';
import { validateTransferProof } from '../../src/server/proof-validation';
import { readStorageItemBounded } from '../../src/server/upload-finalization';
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
});
