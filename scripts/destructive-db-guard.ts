export interface DestructiveDatabaseGuardInput {
  databaseUrl: string | undefined;
  nodeEnv: string | undefined;
  args: string[];
  confirmationFlag: string;
  allowedDatabases?: string[];
}

export function destructiveDatabaseGuardErrors(input: DestructiveDatabaseGuardInput): string[] {
  const errors: string[] = [];
  if (input.nodeEnv?.toLowerCase() === 'production') {
    errors.push('destructive database scripts cannot run when NODE_ENV is production');
  }
  if (!input.args.includes(input.confirmationFlag)) {
    errors.push(`explicit confirmation flag ${input.confirmationFlag} is required`);
  }

  try {
    if (!input.databaseUrl) throw new Error('missing URL');
    const url = new URL(input.databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('unsupported protocol');
    if (!['127.0.0.1', 'localhost'].includes(url.hostname.toLowerCase())) throw new Error('non-local host');
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const allowed = input.allowedDatabases ?? ['ticket_dev', 'ticket_test'];
    if (!allowed.includes(databaseName)) throw new Error('database is not allowlisted');
  } catch {
    errors.push('DATABASE_URL must use localhost or 127.0.0.1 and target ticket_dev or ticket_test only');
  }
  return errors;
}

export function assertDestructiveDatabaseTarget(input: DestructiveDatabaseGuardInput): void {
  const errors = destructiveDatabaseGuardErrors(input);
  if (errors.length) throw new Error(`Blocked destructive database operation: ${errors.join('; ')}`);
}
