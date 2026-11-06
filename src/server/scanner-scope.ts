import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';

export function extractSessionTokenFromCookie(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const cookieMap = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  const rawToken =
    cookieMap['__Secure-ticket.session_token'] || cookieMap['ticket.session_token'];
  if (!rawToken) return null;
  const dotIndex = rawToken.indexOf('.');
  return dotIndex !== -1 ? rawToken.slice(0, dotIndex) : rawToken;
}

export function getScannerEventScopeCookie(
  cookieHeader: string | null | undefined,
  secret: string,
): string | null {
  if (!cookieHeader) return null;
  const cookieMap = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  const scopeVal = cookieMap.scanner_event_scope;
  if (!scopeVal) return null;
  const lastDot = scopeVal.lastIndexOf('.');
  if (lastDot === -1) return null;
  const eventId = scopeVal.slice(0, lastDot);
  const sig = scopeVal.slice(lastDot + 1);
  const expectedSig = createHmac('sha256', secret).update(eventId).digest('base64');
  if (sig !== expectedSig) return null;
  return eventId;
}

export function signScannerEventScopeCookie(eventId: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(eventId).digest('base64');
  return `${eventId}.${sig}`;
}

export type ScannerScopeResolution =
  | { status: 'scoped'; eventId: string }
  | { status: 'unscoped' }
  | { status: 'error'; statusCode: number; reason: string; error?: unknown };

export async function resolveScannerSessionScope(
  pool: Pool | null | undefined,
  cookieHeader: string | null | undefined,
  secret: string,
): Promise<ScannerScopeResolution> {
  // 1. If scanner_event_scope cookie is provided, verify its signature first
  let cookieScope: string | null = null;
  if (cookieHeader?.includes('scanner_event_scope=')) {
    cookieScope = getScannerEventScopeCookie(cookieHeader, secret);
    if (!cookieScope) {
      return {
        status: 'error',
        statusCode: 403,
        reason: 'ไม่อนุญาต: ลายเซ็นขอบเขตงานคอนเสิร์ตไม่ถูกต้องหรือถูกดัดแปลง (Invalid Event Scope Signature)',
      };
    }
  }

  // 2. Check server-side session scope from database (authoritative source)
  const sessionToken = extractSessionTokenFromCookie(cookieHeader);
  if (sessionToken && pool) {
    try {
      const serverScopeRes = await pool.query<{ eventId: string }>(
        'SELECT "eventId" FROM scanner_session_scopes WHERE "sessionToken" = $1',
        [sessionToken],
      );
      if (serverScopeRes.rowCount && serverScopeRes.rowCount > 0) {
        return { status: 'scoped', eventId: serverScopeRes.rows[0].eventId };
      }
    } catch (error: unknown) {
      // Database query failed (including missing table 42P01, timeout, or node down):
      // Fail-closed with error status rather than assuming the session has no scope restrictions
      return {
        status: 'error',
        statusCode: 500,
        reason: 'เกิดข้อผิดพลาดในการตรวจสอบขอบเขตงานคอนเสิร์ต กรุณาลองใหม่อีกครั้ง',
        error,
      };
    }
  }

  // 3. Fallback to verified signed cookie if database record was not present
  if (cookieScope) {
    return { status: 'scoped', eventId: cookieScope };
  }

  // 4. No scope record and no scope cookie -> unscoped
  return { status: 'unscoped' };
}

export async function resolveScannerSessionScopedEventId(
  pool: Pool | null | undefined,
  cookieHeader: string | null | undefined,
  secret: string,
): Promise<string | null> {
  const resolution = await resolveScannerSessionScope(pool, cookieHeader, secret);
  if (resolution.status === 'error') {
    throw new Error(resolution.reason);
  }
  if (resolution.status === 'scoped') {
    return resolution.eventId;
  }
  return null;
}

export async function ensureScannerScopeSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scanner_session_scopes (
      "sessionToken" TEXT PRIMARY KEY,
      "scannerId" TEXT NOT NULL,
      "eventId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_scanner_scopes_scanner ON scanner_session_scopes ("scannerId", "eventId");
  `);
}

export async function recordScannerSessionScope(
  pool: Pool,
  sessionToken: string,
  scannerId: string,
  eventId: string,
): Promise<void> {
  await ensureScannerScopeSchema(pool);
  await pool.query(
    `INSERT INTO scanner_session_scopes ("sessionToken", "scannerId", "eventId", "createdAt")
     VALUES ($1, $2, $3, now())
     ON CONFLICT ("sessionToken") DO UPDATE SET "eventId" = EXCLUDED."eventId", "createdAt" = now()`,
    [sessionToken, scannerId, eventId],
  );
}

export async function verifyScannerSessionEventScope(
  pool: Pool,
  role: string,
  cookieHeader: string | null | undefined,
  secret: string,
  target: { eventId?: string; sessionId?: string; scannerId?: string },
): Promise<{ allowed: boolean; reason?: string }> {
  if (role !== 'scanner') {
    return { allowed: true };
  }

  // 1. Resolve target eventId
  let targetEventId = target.eventId;
  if (!targetEventId && target.sessionId) {
    const sRes = await pool.query<{ eventId: string }>(
      'SELECT "eventId" FROM event_sessions WHERE id = $1',
      [target.sessionId],
    );
    if (sRes.rowCount === 0) {
      return {
        allowed: false,
        reason: 'ไม่พบรอบการแสดงในระบบ',
      };
    }
    targetEventId = sRes.rows[0].eventId;
  }

  if (!targetEventId) {
    return {
      allowed: false,
      reason: 'ไม่สามารถระบุงานคอนเสิร์ตเป้าหมายได้',
    };
  }

  // 2. Resolve scope using resolveScannerSessionScope (Fail-closed on error)
  const scopeResolution = await resolveScannerSessionScope(pool, cookieHeader, secret);

  if (scopeResolution.status === 'error') {
    return {
      allowed: false,
      reason: scopeResolution.reason,
    };
  }

  if (scopeResolution.status === 'scoped') {
    if (scopeResolution.eventId !== targetEventId) {
      return {
        allowed: false,
        reason: 'ไม่อนุญาต: เซสชันการสแกนนี้ถูกจำกัดสิทธิ์เฉพาะงานคอนเสิร์ตที่ได้รับมอบหมายเท่านั้น',
      };
    }
  }

  // 3. Fail-closed: If cookies are sent (e.g. device/session cookies) but status is unscoped
  if (cookieHeader && scopeResolution.status === 'unscoped') {
    return {
      allowed: false,
      reason: 'ไม่อนุญาต: ไม่พบคุกกี้หรือข้อมูลขอบเขตงานคอนเสิร์ตของเจ้าหน้าที่สแกน (Missing Event Scope)',
    };
  }

  // 5. Device binding re-verification for scanner role (D-104)
  if (target.scannerId) {
    const cookieMap = Object.fromEntries(
      (cookieHeader || '').split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      }),
    );
    const requestDeviceId = cookieMap.scanner_device_id;

    const deviceRes = await pool.query<{ boundDeviceId: string | null }>(
      'SELECT "boundDeviceId" FROM event_scanners WHERE "eventId" = $1 AND "scannerId" = $2',
      [targetEventId, target.scannerId],
    );

    if (deviceRes.rowCount && deviceRes.rowCount > 0) {
      const boundDeviceId = deviceRes.rows[0].boundDeviceId;
      if (boundDeviceId) {
        if (!requestDeviceId || requestDeviceId !== boundDeviceId) {
          return {
            allowed: false,
            reason: 'ไม่อนุญาต: อุปกรณ์นี้ไม่ได้ผูกกับสิทธิ์เจ้าหน้าที่สแกนบัตร กรุณาใช้เครื่องที่ลงทะเบียนไว้',
          };
        }
      }
    }
  }

  return { allowed: true };
}
