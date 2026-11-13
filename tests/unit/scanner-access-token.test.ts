import { describe, expect, it } from 'vitest';
import {
  consumeScannerAccessTokenAndBindDevice,
  hashScannerAccessToken,
  inspectScannerAccessToken,
} from '../../src/server/scanner-access';
import type { Pool } from 'pg';

describe('Scanner Access Token helpers (unit)', () => {
  it('hashes tokens deterministically with SHA-256 without returning plaintext', () => {
    const rawToken = 'example-secret-token-value-1234567890';
    const hash1 = hashScannerAccessToken(rawToken);
    const hash2 = hashScannerAccessToken(rawToken);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).not.toContain(rawToken);
  });

  it('rejects empty or malformed short tokens before querying database', async () => {
    const neverQueryPool = {
      query: () => {
        throw new Error('Should not query DB for malformed token');
      },
      connect: () => {
        throw new Error('Should not connect DB for malformed token');
      },
    } as unknown as Pool;

    expect(await inspectScannerAccessToken(neverQueryPool, '')).toBeNull();
    expect(await inspectScannerAccessToken(neverQueryPool, 'short')).toBeNull();

    const consumeEmpty = await consumeScannerAccessTokenAndBindDevice(neverQueryPool, {
      rawToken: '',
      deviceId: 'dev-1',
    });
    expect(consumeEmpty).toEqual({ status: 'invalid' });

    const consumeShort = await consumeScannerAccessTokenAndBindDevice(neverQueryPool, {
      rawToken: 'too-short',
      deviceId: 'dev-1',
    });
    expect(consumeShort).toEqual({ status: 'invalid' });
  });
});
