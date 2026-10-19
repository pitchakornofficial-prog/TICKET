export const roles = ['owner', 'organizer', 'scanner'] as const;
export type Role = typeof roles[number];
export type Actor = { id: string; role: Role; name: string };

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && roles.some(role => role === value);
}

export function roleHome(role: Role): string { return `/back-office/${role}`; }

export function roleAccess(actor: Actor | null, required: Role): 'allowed' | 'unauthenticated' | 'forbidden' {
  if (!actor) return 'unauthenticated';
  return actor.role === required ? 'allowed' : 'forbidden';
}

export type ResourceScope = {
  kind: 'event' | 'order' | 'report' | 'proof';
  organizerId: string;
  scannerIds?: readonly string[];
};

// Callers must load scope from the trusted store, never from request ownership claims.
// This gate checks ownership only. Data-owning tasks must also project role-safe fields.
export function canAccessResource(actor: Actor | null, scope: ResourceScope): boolean {
  if (!actor) return false;
  if (actor.role === 'owner') return true;
  if (scope.kind === 'proof') return false;
  if (actor.role === 'organizer') return actor.id === scope.organizerId;
  return actor.role === 'scanner' && scope.kind === 'event' && !!scope.scannerIds?.includes(actor.id);
}
