/**
 * Centralized API error handling and sanitization utility.
 * Prevents information disclosure (such as database structure, SQL queries, table names,
 * and internal stack traces) to API clients, in compliance with CWE-209 / OWASP A05:2021.
 */

export interface SafeErrorOptions {
  /**
   * Default HTTP status code when none is resolved. Defaults to 500.
   */
  defaultStatus?: number;
  /**
   * Optional custom resolver to map safe domain messages to HTTP status codes (e.g. 400, 401, 403, 404).
   */
  statusResolver?: (message: string) => number;
}

export interface SafeErrorResult {
  message: string;
  status: number;
}

/**
 * Checks whether an error represents a database, system, network, or internal runtime error
 * that must never be exposed to the client.
 */
export function isDatabaseOrInternalError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as Record<string, unknown>;

  // 1. PostgreSQL driver fields (from `pg` / DatabaseError)
  if (typeof err.code === 'string') {
    // Standard PostgreSQL SQLSTATE codes are 5 characters (e.g. 42P01, 23505, 08006, etc.)
    // or Node.js system error codes (e.g. ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ERR_*)
    if (
      /^[0-9A-Z]{5}$/.test(err.code) ||
      err.code.startsWith('ECONN') ||
      err.code.startsWith('ERR_') ||
      err.code === 'ETIMEDOUT'
    ) {
      return true;
    }
  }

  if (
    typeof err.severity === 'string' &&
    ['ERROR', 'FATAL', 'PANIC'].includes(err.severity.toUpperCase())
  ) {
    return true;
  }

  if (
    'table' in err ||
    'column' in err ||
    'constraint' in err ||
    'routine' in err ||
    'internalQuery' in err ||
    'schema' in err
  ) {
    return true;
  }

  // 2. Technical error constructor / names
  const name = typeof err.name === 'string' ? err.name : '';
  if (
    [
      'DatabaseError',
      'PgError',
      'PostgresError',
      'TypeError',
      'SyntaxError',
      'ReferenceError',
      'RangeError',
      'URIError',
      'EvalError',
    ].includes(name)
  ) {
    return true;
  }

  // 3. Technical keywords in message that indicate SQL, driver, or low-level failures
  if (typeof err.message === 'string') {
    const msg = err.message.toLowerCase();
    const technicalPatterns = [
      'relation "',
      'column "',
      'table "',
      'syntax error at',
      'violates unique constraint',
      'violates not-null constraint',
      'violates foreign key constraint',
      'violates check constraint',
      'connection terminated',
      'database "',
      'pg_',
      'econnrefused',
      'pool is closed',
      'client has already been released',
      'select ',
      'insert into',
      'update ',
      'delete from',
      'from "',
      'where "',
    ];

    if (technicalPatterns.some((pattern) => msg.includes(pattern))) {
      return true;
    }
  }

  return false;
}

/**
 * Returns a sanitized, client-safe error message and HTTP status code.
 * If the error is an internal/database error, it logs the full error server-side
 * and returns the generic fallback message with HTTP 500 (or default status >= 500).
 * If the error is a user-facing domain/business error, its message is preserved
 * along with the determined status code.
 */
export function formatSafeApiError(
  error: unknown,
  fallbackMessage: string,
  options?: SafeErrorOptions,
): SafeErrorResult {
  const defaultStatus = options?.defaultStatus ?? 500;

  // If it is a database or internal system error, never expose details to the client
  if (isDatabaseOrInternalError(error)) {
    console.error('[API Internal Error]:', error);
    return {
      message: fallbackMessage,
      status: defaultStatus >= 500 ? defaultStatus : 500,
    };
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) {
      const status = options?.statusResolver
        ? options.statusResolver(message)
        : defaultStatus;
      return { message, status };
    }
  }

  console.error('[API Unknown Error]:', error);
  return {
    message: fallbackMessage,
    status: defaultStatus,
  };
}

/**
 * Convenience helper to return a Response object directly from a caught API error.
 */
export function createSafeErrorResponse(
  error: unknown,
  fallbackMessage: string,
  options?: SafeErrorOptions,
): Response {
  const { message, status } = formatSafeApiError(error, fallbackMessage, options);
  return Response.json({ message }, { status });
}
