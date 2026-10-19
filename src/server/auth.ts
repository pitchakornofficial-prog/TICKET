import { betterAuth } from 'better-auth';
import { createDatabasePool } from './database.ts';
import { authOptions } from './auth-options.ts';
import { isRole, type Actor } from '../lib/back-office-access.ts';

export function createAuth(pool: ReturnType<typeof createDatabasePool>, settings: { baseURL: string; secret: string }) {
  return betterAuth(authOptions(pool, settings));
}
export type TicketAuth = ReturnType<typeof createAuth>;
let auth: TicketAuth | undefined;

// Only the pool/config is process-local; every session/role lookup uses PostgreSQL.
export function getAuth(): TicketAuth {
  if (!auth) {
    const baseURL = process.env.BETTER_AUTH_URL;
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!baseURL || !secret) throw new Error('Configure BETTER_AUTH_URL and BETTER_AUTH_SECRET before starting authentication');
    auth = createAuth(createDatabasePool(), { baseURL, secret });
  }
  return auth;
}

export async function readActor(instance: TicketAuth, headers: HeadersInit): Promise<Actor | null> {
  const session = await instance.api.getSession({ headers });
  if (!session || !isRole(session.user.role)) return null;
  return { id: session.user.id, role: session.user.role, name: session.user.name };
}
