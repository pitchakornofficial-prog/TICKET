import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { inTransaction } from './database.ts';

export const MAX_REQUEST_BODY_SIZE = 16 * 1024 * 1024; // 16MB limit for HTTP request body
export const MAX_JSON_BODY_SIZE = 1 * 1024 * 1024; // 1MB limit for JSON requests
export const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB limit for single file payload
export const MAX_UPLOADS_PER_WINDOW = 20; // 20 uploads per window
export const MAX_BYTES_PER_WINDOW = 50 * 1024 * 1024; // 50MB cumulative quota per window
export const UPLOAD_WINDOW_MS = 10 * 60 * 1000; // 10-minute sliding window

interface UploadRecord {
  id: string;
  timestamp: number;
  bytes: number;
}

const userUploadHistory = new Map<string, UploadRecord[]>();

// Serializes in-memory checking and reserving to eliminate race conditions
let memoryLock = Promise.resolve();

function withMemoryLock<T>(fn: () => Promise<T> | T): Promise<T> {
  let release: () => void;
  const nextLock = new Promise<void>((res) => {
    release = res;
  });
  const currentLock = memoryLock;
  memoryLock = nextLock;
  return currentLock.then(() => Promise.resolve(fn())).finally(() => release?.());
}

/**
 * Validates Content-Length header before parsing multipart/form-data.
 * Rejects requests with 413 Payload Too Large if Content-Length exceeds MAX_REQUEST_BODY_SIZE.
 */
export function validateUploadContentLength(contentLengthHeader: string | null): {
  valid: boolean;
  error?: string;
  status?: number;
} {
  if (!contentLengthHeader) {
    return { valid: true };
  }

  const length = Number.parseInt(contentLengthHeader.trim(), 10);
  if (Number.isNaN(length) || length < 0) {
    return {
      valid: false,
      error: 'ส่วนหัว Content-Length ไม่ถูกต้อง',
      status: 400,
    };
  }

  if (length > MAX_REQUEST_BODY_SIZE) {
    return {
      valid: false,
      error: 'ขนาดคำขอเกินขีดจำกัดสูงสุด (Payload Too Large: สูงสุด 16MB)',
      status: 413,
    };
  }

  return { valid: true };
}

/**
 * Reads request body stream with a hard byte ceiling.
 * If stream exceeds maxBytes, immediately cancels stream consumption and throws PAYLOAD_TOO_LARGE.
 */
export async function readBoundedFormData(
  request: Request,
  maxBytes = MAX_REQUEST_BODY_SIZE,
): Promise<FormData> {
  // Pre-check Content-Length header
  const cl = request.headers.get('content-length');
  if (cl) {
    const len = Number.parseInt(cl, 10);
    if (!Number.isNaN(len) && len > maxBytes) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
  }

  if (!request.body) {
    return await request.formData();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = Buffer.concat(chunks);
  const newReq = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: combined,
  });
  return await newReq.formData();
}

/**
 * Reads request body stream with a hard byte ceiling and parses as JSON.
 * Throws PAYLOAD_TOO_LARGE if stream exceeds maxBytes.
 */
export async function readBoundedJson<T = unknown>(
  request: Request,
  maxBytes = MAX_JSON_BODY_SIZE,
): Promise<T> {
  // Pre-check Content-Length header
  const cl = request.headers.get('content-length');
  if (cl) {
    const len = Number.parseInt(cl, 10);
    if (!Number.isNaN(len) && len > maxBytes) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
  }

  if (!request.body) {
    return (await request.json()) as T;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(combined) as T;
}

/**
 * Ensures the PostgreSQL upload quotas table exists.
 */
export async function ensureUploadQuotaSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS upload_quotas (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      bytes BIGINT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_upload_quotas_user_time ON upload_quotas ("userId", "createdAt");
  `);
}

/**
 * Atomically checks and reserves upload quota in shared PostgreSQL or serialized memory store.
 */
export async function checkAndReserveUploadQuota(
  pool: Pool | null | undefined,
  userId: string,
  requestedBytes: number,
  now = Date.now(),
): Promise<{
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  reservationId?: string;
}> {
  // 1. PostgreSQL Shared Store Mode with Advisory Lock
  if (pool && typeof pool.connect === 'function') {
    try {
      await ensureUploadQuotaSchema(pool);
      return await inTransaction(pool, async (client) => {
        // Shared atomic lock for this user's quota
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
          ['upload_quota', userId],
        );

        // Clean expired entries
        await client.query(
          `DELETE FROM upload_quotas WHERE "createdAt" < now() - interval '10 minutes'`,
        );

        const statsRes = await client.query<{
          count: number;
          totalBytes: string;
          oldestInWindow: Date | null;
        }>(
          `SELECT count(*)::int AS count,
                  coalesce(sum(bytes), 0)::bigint AS "totalBytes",
                  min("createdAt") AS "oldestInWindow"
           FROM upload_quotas
           WHERE "userId" = $1 AND "createdAt" >= now() - interval '10 minutes'`,
          [userId],
        );

        const currentCount = statsRes.rows[0]?.count || 0;
        const currentBytes = Number.parseInt(statsRes.rows[0]?.totalBytes || '0', 10);
        const oldestTime = statsRes.rows[0]?.oldestInWindow
          ? new Date(statsRes.rows[0].oldestInWindow).getTime()
          : now;
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((oldestTime + UPLOAD_WINDOW_MS - now) / 1000),
        );

        if (currentCount >= MAX_UPLOADS_PER_WINDOW) {
          return {
            allowed: false,
            reason:
              'จำนวนการอัปโหลดเกินโควตาที่กำหนด (สูงสุด 20 ไฟล์ต่อ 10 นาที) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
            retryAfterSeconds,
          };
        }

        if (requestedBytes > MAX_FILE_SIZE) {
          return {
            allowed: false,
            reason: 'ขนาดไฟล์เกินขีดจำกัด (สูงสุด 15MB)',
          };
        }

        if (currentBytes + requestedBytes > MAX_BYTES_PER_WINDOW) {
          return {
            allowed: false,
            reason:
              'ปริมาณข้อมูลรวมที่อัปโหลดเกินโควตาที่กำหนด (สูงสุด 50MB ต่อ 10 นาที) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
            retryAfterSeconds,
          };
        }

        const reservationId = `RSV-${randomUUID()}`;
        await client.query(
          `INSERT INTO upload_quotas (id, "userId", bytes, "createdAt")
           VALUES ($1, $2, $3, now())`,
          [reservationId, userId, requestedBytes],
        );

        return {
          allowed: true,
          reservationId,
        };
      });
    } catch {
      // Fail-closed when DB operation fails to preserve global quota integrity across instances
      return {
        allowed: false,
        reason:
          'ระบบจัดเก็บข้อมูลไม่พร้อมให้บริการชั่วคราว ไม่สามารถตรวจสอบโควตาได้ กรุณาลองใหม่อีกครั้งในภายหลัง',
        retryAfterSeconds: 30,
      };
    }
  }

  // 2. Synchronized In-Memory Store Mode (Mutex serialized to prevent race condition)
  return withMemoryLock(() => {
    const windowStart = now - UPLOAD_WINDOW_MS;
    const history = userUploadHistory.get(userId) || [];

    const activeHistory = history.filter((entry) => entry.timestamp > windowStart);
    if (activeHistory.length !== history.length) {
      userUploadHistory.set(userId, activeHistory);
    }

    const currentCount = activeHistory.length;
    const currentBytes = activeHistory.reduce((acc, entry) => acc + entry.bytes, 0);

    const oldestTimestamp = activeHistory[0]?.timestamp || now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestTimestamp + UPLOAD_WINDOW_MS - now) / 1000),
    );

    if (currentCount >= MAX_UPLOADS_PER_WINDOW) {
      return {
        allowed: false,
        reason:
          'จำนวนการอัปโหลดเกินโควตาที่กำหนด (สูงสุด 20 ไฟล์ต่อ 10 นาที) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
        retryAfterSeconds,
      };
    }

    if (requestedBytes > MAX_FILE_SIZE) {
      return {
        allowed: false,
        reason: 'ขนาดไฟล์เกินขีดจำกัด (สูงสุด 15MB)',
      };
    }

    if (currentBytes + requestedBytes > MAX_BYTES_PER_WINDOW) {
      return {
        allowed: false,
        reason:
          'ปริมาณข้อมูลรวมที่อัปโหลดเกินโควตาที่กำหนด (สูงสุด 50MB ต่อ 10 นาที) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
        retryAfterSeconds,
      };
    }

    const reservationId = `RSV-${randomUUID()}`;
    activeHistory.push({ id: reservationId, timestamp: now, bytes: requestedBytes });
    userUploadHistory.set(userId, activeHistory);

    return {
      allowed: true,
      reservationId,
    };
  });
}

/**
 * Releases a reserved quota if validation or processing fails.
 */
export async function releaseUploadQuota(
  pool: Pool | null | undefined,
  reservationId?: string,
): Promise<void> {
  if (!reservationId) return;

  if (pool && typeof pool.query === 'function') {
    try {
      await pool.query('DELETE FROM upload_quotas WHERE id = $1', [reservationId]);
      return;
    } catch {
      // Fallback
    }
  }

  await withMemoryLock(() => {
    for (const [userId, history] of userUploadHistory.entries()) {
      const idx = history.findIndex((h) => h.id === reservationId);
      if (idx !== -1) {
        history.splice(idx, 1);
        userUploadHistory.set(userId, history);
        break;
      }
    }
  });
}

/**
 * Clears upload history (useful for tests).
 */
export async function resetUploadUsage(
  pool?: Pool | null,
  userId?: string,
): Promise<void> {
  if (pool && typeof pool.query === 'function') {
    try {
      if (userId) {
        await pool.query('DELETE FROM upload_quotas WHERE "userId" = $1', [userId]);
      } else {
        await pool.query('DELETE FROM upload_quotas');
      }
    } catch {
      // In case table does not exist
    }
  }

  await withMemoryLock(() => {
    if (userId) {
      userUploadHistory.delete(userId);
    } else {
      userUploadHistory.clear();
    }
  });
}
