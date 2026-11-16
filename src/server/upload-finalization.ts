import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { StorageItem } from './storage.ts';

export interface UploadFinalizeClaims {
  intentId: string;
  actorId: string;
  uploadKey: string;
  key: string;
  contentType: string;
  visibility: 'public' | 'private';
  maxFileSizeBytes: number;
  reservationId?: string;
  expiresAt: number;
}

type UploadIntentStatus = 'pending' | 'finalizing' | 'finalized' | 'rejected';
const memoryUploadIntents = new Map<string, { claims: UploadFinalizeClaims; status: UploadIntentStatus }>();
const uploadIntentSchemaPromises = new WeakMap<Pool, Promise<void>>();

export async function ensureUploadFinalizeSchema(pool: Pool): Promise<void> {
  const existing = uploadIntentSchemaPromises.get(pool);
  if (existing) return existing;
  const promise = pool.query(`
    CREATE TABLE IF NOT EXISTS upload_finalize_intents (
      id TEXT PRIMARY KEY,
      "actorId" TEXT NOT NULL,
      "uploadKey" TEXT NOT NULL UNIQUE,
      "targetKey" TEXT NOT NULL UNIQUE,
      "contentType" TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
      "maxFileSizeBytes" INTEGER NOT NULL,
      "reservationId" TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'finalizing', 'finalized', 'rejected')),
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "finalizedAt" TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_upload_finalize_intents_expiry
      ON upload_finalize_intents(status, "expiresAt");
  `).then(() => {});
  uploadIntentSchemaPromises.set(pool, promise);
  try {
    await promise;
  } catch (error) {
    uploadIntentSchemaPromises.delete(pool);
    throw error;
  }
}

function tokenSecret(): string {
  const configured = process.env.UPLOAD_FINALIZE_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return 'ticket-local-upload-finalize-token-v1';
  throw new Error('Upload finalization signing secret is not configured');
}

function signature(payload: string): Buffer {
  return createHmac('sha256', tokenSecret()).update(payload).digest();
}

function validClaims(value: unknown): value is UploadFinalizeClaims {
  if (!value || typeof value !== 'object') return false;
  const claims = value as Partial<UploadFinalizeClaims>;
  return typeof claims.intentId === 'string' && /^[a-f0-9-]{36}$/.test(claims.intentId) &&
    typeof claims.actorId === 'string' && claims.actorId.length > 0 &&
    typeof claims.uploadKey === 'string' && /^pending\/[a-f0-9-]+\.(jpg|png|webp|pdf)$/.test(claims.uploadKey) &&
    typeof claims.key === 'string' && /^(posters|proofs)\/[a-f0-9-]+\.(jpg|png|webp|pdf)$/.test(claims.key) &&
    typeof claims.contentType === 'string' &&
    (claims.visibility === 'public' || claims.visibility === 'private') &&
    Number.isInteger(claims.maxFileSizeBytes) && Number(claims.maxFileSizeBytes) > 0 &&
    Number(claims.maxFileSizeBytes) <= 15 * 1024 * 1024 &&
    typeof claims.expiresAt === 'number' && Number.isFinite(claims.expiresAt) &&
    (claims.reservationId === undefined || typeof claims.reservationId === 'string');
}

export function createUploadFinalizeToken(claims: UploadFinalizeClaims): string {
  if (!validClaims(claims)) throw new Error('Invalid upload finalization claims');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
}

export async function persistUploadFinalizeIntent(
  pool: Pool | undefined,
  claims: UploadFinalizeClaims,
): Promise<void> {
  if (pool) {
    await ensureUploadFinalizeSchema(pool);
    await pool.query('DELETE FROM upload_finalize_intents WHERE "expiresAt" < now() - interval \'1 day\'');
    await pool.query(
      `INSERT INTO upload_finalize_intents (
         id, "actorId", "uploadKey", "targetKey", "contentType", visibility,
         "maxFileSizeBytes", "reservationId", status, "expiresAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9::timestamptz)`,
      [claims.intentId, claims.actorId, claims.uploadKey, claims.key, claims.contentType,
        claims.visibility, claims.maxFileSizeBytes, claims.reservationId ?? null, new Date(claims.expiresAt)],
    );
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Shared upload finalization storage is not configured');
  }
  memoryUploadIntents.set(claims.intentId, { claims, status: 'pending' });
}

export async function claimUploadFinalizeIntent(
  pool: Pool | undefined,
  claims: UploadFinalizeClaims,
): Promise<boolean> {
  if (pool) {
    await ensureUploadFinalizeSchema(pool);
    const result = await pool.query(
      `UPDATE upload_finalize_intents
       SET status = 'finalizing'
       WHERE id = $1 AND "actorId" = $2 AND "uploadKey" = $3 AND "targetKey" = $4
         AND "contentType" = $5 AND visibility = $6 AND "maxFileSizeBytes" = $7
         AND "reservationId" IS NOT DISTINCT FROM $8
         AND status = 'pending' AND "expiresAt" > now()`,
      [claims.intentId, claims.actorId, claims.uploadKey, claims.key, claims.contentType,
        claims.visibility, claims.maxFileSizeBytes, claims.reservationId ?? null],
    );
    return (result.rowCount ?? 0) === 1;
  }
  if (process.env.NODE_ENV === 'production') return false;
  const intent = memoryUploadIntents.get(claims.intentId);
  if (intent?.status !== 'pending' || JSON.stringify(intent.claims) !== JSON.stringify(claims)) return false;
  intent.status = 'finalizing';
  return true;
}

export async function setUploadFinalizeIntentStatus(
  pool: Pool | undefined,
  intentId: string,
  status: Exclude<UploadIntentStatus, 'finalizing'>,
): Promise<boolean> {
  if (pool) {
    await ensureUploadFinalizeSchema(pool);
    const result = await pool.query(
      `UPDATE upload_finalize_intents
       SET status = $2, "finalizedAt" = CASE WHEN $2 = 'finalized' THEN now() ELSE NULL END
       WHERE id = $1 AND status = 'finalizing'`,
      [intentId, status],
    );
    return (result.rowCount ?? 0) === 1;
  }
  if (process.env.NODE_ENV === 'production') return false;
  const intent = memoryUploadIntents.get(intentId);
  if (intent?.status !== 'finalizing') return false;
  intent.status = status;
  return true;
}

export function verifyUploadFinalizeToken(token: string): UploadFinalizeClaims | null {
  try {
    const [payload, encodedSignature, extra] = token.split('.');
    if (!payload || !encodedSignature || extra !== undefined) return null;
    const provided = Buffer.from(encodedSignature, 'base64url');
    const expected = signature(payload);
    if (provided.byteLength !== expected.byteLength || !timingSafeEqual(provided, expected)) return null;
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!validClaims(claims) || claims.expiresAt <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function readStorageItemBounded(
  key: string,
  maxBytes: number,
  storage: {
    get(key: string): Promise<StorageItem | null>;
    getStream?(key: string): Promise<{
      stream: ReadableStream<Uint8Array>;
      contentType: string;
      visibility: 'public' | 'private';
      contentLength?: number;
    } | null>;
  },
): Promise<(StorageItem & { data: Buffer }) | null> {
  const streamed = await storage.getStream?.(key);
  if (streamed) {
    if (streamed.contentLength !== undefined && streamed.contentLength > maxBytes) {
      await streamed.stream.cancel().catch(() => {});
      throw new Error('UPLOAD_TOO_LARGE');
    }
    const reader = streamed.stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error('UPLOAD_TOO_LARGE');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return {
      data: Buffer.concat(chunks.map(chunk => Buffer.from(chunk))),
      contentType: streamed.contentType,
      visibility: streamed.visibility,
    };
  }

  const item = await storage.get(key);
  if (!item) return null;
  if (item.data.byteLength > maxBytes) throw new Error('UPLOAD_TOO_LARGE');
  return { ...item, data: Buffer.from(item.data) };
}
