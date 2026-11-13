import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from './database.ts';

export const SCANNER_ACCESS_TOKEN_EXPIRATION_HOURS = 48;

export function hashScannerAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const scannerAccessSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureScannerAccessTokenSchema(pool: Pool): Promise<void> {
  const existing = scannerAccessSchemaPromises.get(pool);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS scanner_access_tokens (
          id TEXT PRIMARY KEY,
          "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          "scannerId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
          "tokenHash" TEXT NOT NULL UNIQUE,
          "expiresAt" TIMESTAMPTZ NOT NULL,
          "usedAt" TIMESTAMPTZ,
          "usedByDeviceId" TEXT,
          "revokedAt" TIMESTAMPTZ,
          "createdBy" TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_scanner_access_tokens_hash ON scanner_access_tokens("tokenHash");
        CREATE INDEX IF NOT EXISTS idx_scanner_access_tokens_pair ON scanner_access_tokens("eventId", "scannerId");
      `);
    } catch (err) {
      scannerAccessSchemaPromises.delete(pool);
      throw err;
    }
  })();

  scannerAccessSchemaPromises.set(pool, promise);
  return promise;
}

export interface IssuedScannerAccessToken {
  id: string;
  rawToken: string;
  accessUrl: string;
  expiresAt: string;
}

export async function issueScannerAccessTokenWithClient(
  client: Pool | PoolClient,
  options: {
    eventId: string;
    scannerId: string;
    createdBy?: string | null;
    expiresInHours?: number;
    now?: Date;
  },
): Promise<IssuedScannerAccessToken> {
  const now = options.now ?? new Date();
  const expiresInHours = options.expiresInHours ?? SCANNER_ACCESS_TOKEN_EXPIRATION_HOURS;
  if (!Number.isFinite(expiresInHours) || expiresInHours <= 0) {
    throw new Error('อายุโทเคนไม่ถูกต้อง');
  }

  // Revoke any previously issued unused tokens for this event+scanner pair
  await client.query(
    `UPDATE scanner_access_tokens
     SET "revokedAt" = $3
     WHERE "eventId" = $1 AND "scannerId" = $2 AND "usedAt" IS NULL AND "revokedAt" IS NULL`,
    [options.eventId, options.scannerId, now],
  );

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashScannerAccessToken(rawToken);
  const id = `SAT-${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

  await client.query(
    `INSERT INTO scanner_access_tokens (id, "eventId", "scannerId", "tokenHash", "expiresAt", "createdBy", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      options.eventId,
      options.scannerId,
      tokenHash,
      expiresAt,
      options.createdBy ?? null,
      now,
    ],
  );

  return {
    id,
    rawToken,
    accessUrl: `/scanner/access?token=${encodeURIComponent(rawToken)}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function issueScannerAccessToken(
  pool: Pool,
  options: {
    eventId: string;
    scannerId: string;
    createdBy?: string | null;
    expiresInHours?: number;
    now?: Date;
  },
): Promise<IssuedScannerAccessToken> {
  await ensureScannerAccessTokenSchema(pool);
  return inTransaction(pool, (client) => issueScannerAccessTokenWithClient(client, options));
}

export async function revokeScannerAccessTokens(
  clientOrPool: Pool | PoolClient,
  eventId: string,
  scannerId: string,
  now: Date = new Date(),
): Promise<number> {
  const res = await clientOrPool.query(
    `UPDATE scanner_access_tokens
     SET "revokedAt" = $3
     WHERE "eventId" = $1 AND "scannerId" = $2 AND "revokedAt" IS NULL`,
    [eventId, scannerId, now],
  );
  return res.rowCount ?? 0;
}

export async function issueScannerAccessTokenForOrganizer(
  pool: Pool,
  organizerId: string,
  eventId: string,
  scannerId: string,
  options?: { expiresInHours?: number; now?: Date },
): Promise<IssuedScannerAccessToken> {
  await ensureScannerAccessTokenSchema(pool);

  const evRes = await pool.query<{ organizerId: string }>(
    'SELECT "organizerId" FROM events WHERE id = $1',
    [eventId],
  );
  if (evRes.rowCount === 0) {
    throw new Error('ไม่พบงานคอนเสิร์ต');
  }
  if (evRes.rows[0].organizerId !== organizerId) {
    throw new Error('คุณไม่มีสิทธิ์จัดการทีมสแกนของงานนี้');
  }

  const scRes = await pool.query(
    `SELECT es.id
     FROM event_scanners es
     JOIN auth_user u ON u.id = es."scannerId"
     WHERE es."eventId" = $1 AND es."scannerId" = $2 AND u.role = 'scanner'`,
    [eventId, scannerId],
  );
  if ((scRes.rowCount ?? 0) === 0) {
    throw new Error('ไม่พบทีมสแกนในงานนี้');
  }

  return issueScannerAccessToken(pool, {
    eventId,
    scannerId,
    createdBy: organizerId,
    expiresInHours: options?.expiresInHours,
    now: options?.now,
  });
}

export interface InspectedScannerAccessToken {
  eventId: string;
  organizerId: string;
  scannerId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
}

export async function inspectScannerAccessToken(
  pool: Pool,
  rawToken: string,
): Promise<InspectedScannerAccessToken | null> {
  if (!rawToken || rawToken.length < 16) {
    return null;
  }
  await ensureScannerAccessTokenSchema(pool);
  const tokenHash = hashScannerAccessToken(rawToken);
  const res = await pool.query<{
    eventId: string;
    organizerId: string;
    scannerId: string;
    revokedAt: Date | null;
    expiresAt: Date;
    usedAt: Date | null;
  }>(
    `SELECT t."eventId", e."organizerId", t."scannerId", t."revokedAt", t."expiresAt", t."usedAt"
     FROM scanner_access_tokens t
     JOIN events e ON e.id = t."eventId"
     WHERE t."tokenHash" = $1`,
    [tokenHash],
  );
  if ((res.rowCount ?? 0) === 0) {
    return null;
  }
  return res.rows[0];
}

export type ConsumeScannerAccessTokenResult =
  | {
      status: 'ok';
      eventId: string;
      scannerId: string;
      scannerName: string;
    }
  | {
      status: 'invalid';
    }
  | {
      status: 'revoked' | 'expired' | 'used' | 'bound_other_device';
      eventId: string;
      scannerName: string;
    };

class ConsumeAbortRollback extends Error {
  readonly result: ConsumeScannerAccessTokenResult;
  constructor(result: ConsumeScannerAccessTokenResult) {
    super('Consume aborted');
    this.result = result;
  }
}

export async function consumeScannerAccessTokenAndBindDevice(
  pool: Pool,
  options: {
    rawToken: string;
    deviceId: string;
    now?: Date;
  },
): Promise<ConsumeScannerAccessTokenResult> {
  if (!options.rawToken || options.rawToken.length < 16) {
    return { status: 'invalid' };
  }

  await ensureScannerAccessTokenSchema(pool);
  const tokenHash = hashScannerAccessToken(options.rawToken);
  const now = options.now ?? new Date();

  try {
    return await inTransaction(pool, async (client) => {
      const lookupRes = await client.query<{
        id: string;
        eventId: string;
        scannerId: string;
        expiresAt: Date;
        usedAt: Date | null;
        revokedAt: Date | null;
        name: string;
        boundDeviceId: string | null;
      }>(
        `SELECT t.id, t."eventId", t."scannerId", t."expiresAt", t."usedAt", t."revokedAt",
                u.name, es."boundDeviceId"
         FROM scanner_access_tokens t
         JOIN auth_user u ON u.id = t."scannerId"
         JOIN event_scanners es ON es."eventId" = t."eventId" AND es."scannerId" = t."scannerId"
         WHERE t."tokenHash" = $1 AND u.role = 'scanner'`,
        [tokenHash],
      );

      if ((lookupRes.rowCount ?? 0) === 0) {
        return { status: 'invalid' };
      }

      const row = lookupRes.rows[0];

      if (row.revokedAt) {
        return { status: 'revoked', eventId: row.eventId, scannerName: row.name };
      }

      const expiresAtMs =
        row.expiresAt instanceof Date
          ? row.expiresAt.getTime()
          : new Date(row.expiresAt).getTime();
      if (expiresAtMs <= now.getTime()) {
        return { status: 'expired', eventId: row.eventId, scannerName: row.name };
      }

      if (row.usedAt) {
        return { status: 'used', eventId: row.eventId, scannerName: row.name };
      }

      // Atomically consume the single-use token
      const consumeRes = await client.query(
        `UPDATE scanner_access_tokens
         SET "usedAt" = $2, "usedByDeviceId" = $3
         WHERE id = $1 AND "usedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > $2
         RETURNING id`,
        [row.id, now, options.deviceId],
      );

      if ((consumeRes.rowCount ?? 0) === 0) {
        return { status: 'used', eventId: row.eventId, scannerName: row.name };
      }

      // Atomically bind device if currently unbound, or verify same device
      if (!row.boundDeviceId) {
        const bindRes = await client.query(
          `UPDATE event_scanners
           SET "boundDeviceId" = $1, "boundAt" = $2
           WHERE "eventId" = $3 AND "scannerId" = $4 AND "boundDeviceId" IS NULL
           RETURNING "boundDeviceId"`,
          [options.deviceId, now, row.eventId, row.scannerId],
        );

        if ((bindRes.rowCount ?? 0) === 0) {
          const recheckRes = await client.query<{ boundDeviceId: string | null }>(
            `SELECT "boundDeviceId" FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2`,
            [row.eventId, row.scannerId],
          );
          if (recheckRes.rows[0]?.boundDeviceId !== options.deviceId) {
            throw new ConsumeAbortRollback({
              status: 'bound_other_device',
              eventId: row.eventId,
              scannerName: row.name,
            });
          }
        }
      } else if (row.boundDeviceId !== options.deviceId) {
        throw new ConsumeAbortRollback({
          status: 'bound_other_device',
          eventId: row.eventId,
          scannerName: row.name,
        });
      }

      return {
        status: 'ok',
        eventId: row.eventId,
        scannerId: row.scannerId,
        scannerName: row.name,
      };
    });
  } catch (err) {
    if (err instanceof ConsumeAbortRollback) {
      return err.result;
    }
    throw err;
  }
}
